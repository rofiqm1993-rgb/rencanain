import { importPKCS8, SignJWT } from "jose";
import { runtimeValues } from "./server-runtime";

export class ServiceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export type RecordData = Record<string, unknown>;
export interface Transaction {
  get(path: string): Promise<RecordData | null>;
  set(path: string, value: RecordData): void;
  delete(path: string): void;
}
export interface TransactionalStore { run<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> }
type Value = { nullValue?: null; booleanValue?: boolean; stringValue?: string; integerValue?: string; doubleValue?: number; mapValue?: { fields: Record<string, Value> }; arrayValue?: { values: Value[] } };
export function encodeValue(value: unknown): Value {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) {
    if (value.some(Array.isArray)) throw new Error("Nested Firestore arrays must be wrapped in maps.");
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (value && typeof value === "object") return { mapValue: { fields: encodeFields(value as RecordData) } };
  throw new Error("Unsupported Firestore value.");
}
export function encodeFields(value: RecordData): Record<string, Value> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encodeValue(v)]));
}
export function decodeValue(value: Value): unknown {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
  if (value.mapValue) return decodeFields(value.mapValue.fields || {});
  throw new Error("Unsupported stored value.");
}
export function decodeFields(fields: Record<string, Value>): RecordData { return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)])); }
class FirestoreError extends Error { constructor(public code: string) { super(code); } }
let cachedToken: { credential: string; token: string; expiresAt: number } | null = null;
async function accessToken() {
  const config = runtimeValues();
  const credential = config.serviceAccount;
  if (!credential || !config.firebase) throw new ServiceError(503, "storage-config", "Penyimpanan dan kuota server belum dikonfigurasi. Draft dan ekspor lokal tetap tersedia.");
  if (cachedToken?.credential === credential && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;
  try {
    const account = JSON.parse(credential) as { project_id: string; client_email: string; private_key: string };
    if (account.project_id !== config.firebase.projectId || !account.client_email || !account.private_key) throw new Error("Invalid credential");
    const key = await importPKCS8(account.private_key, "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" }).setProtectedHeader({ alg: "RS256" }).setIssuer(account.client_email).setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h").sign(key);
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(10000) });
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!response.ok || !body.access_token || !Number.isFinite(body.expires_in)) throw new Error("Token unavailable");
    cachedToken = { credential, token: body.access_token, expiresAt: Date.now() + Number(body.expires_in) * 1000 };
    return cachedToken.token;
  } catch { throw new ServiceError(503, "storage-auth", "Akses penyimpanan server belum tersedia. Pengelola perlu memeriksa konfigurasi Firebase server."); }
}
export function createFirestoreStore(): TransactionalStore {
  return { async run<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> {
    const config = runtimeValues();
    if (!config.firebase) throw new ServiceError(503, "storage-config", "Firebase server belum dikonfigurasi.");
    const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.firebase.projectId)}/databases/(default)/documents`;
    const name = `projects/${config.firebase.projectId}/databases/(default)/documents/`;
    const token = await accessToken();
    async function call(suffix: string, body?: unknown, missing = false) {
      const response = await fetch(base + suffix, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12000) });
      if (missing && response.status === 404) return null;
      const result = await response.json() as { error?: { status?: string }; [key: string]: unknown };
      if (!response.ok) {
        if (response.status === 401) cachedToken = null;
        throw new FirestoreError(result.error?.status || "UNAVAILABLE");
      }
      return result;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      let transaction: string | undefined;
      try {
        const started = await call(":beginTransaction", { options: { readWrite: {} } });
        transaction = started?.transaction as string;
        if (!transaction) throw new FirestoreError("UNAVAILABLE");
        const writes: unknown[] = [];
        const validPath = (path: string) => { const parts = path.split("/"); if (parts.length % 2 || parts.some(p => !p || p === "." || p === "..")) throw new Error("Invalid document path"); return parts.map(encodeURIComponent).join("/"); };
        const result = await operation({
          async get(path) { const document = await call(`/${validPath(path)}?transaction=${encodeURIComponent(transaction!)}`, undefined, true); return document ? decodeFields((document.fields || {}) as Record<string, Value>) : null; },
          set(path, value) { validPath(path); writes.push({ update: { name: name + path, fields: encodeFields(value) } }); },
          delete(path) { validPath(path); writes.push({ delete: name + path }); },
        });
        await call(":commit", { transaction, writes });
        return result;
      } catch (error) {
        if (transaction) { try { await call(":rollback", { transaction }); } catch { /* An ambiguous commit is resolved by retrying the same durable operation. */ } }
        if (error instanceof ServiceError) throw error;
        if (error instanceof FirestoreError && ["ABORTED", "UNAVAILABLE", "DEADLINE_EXCEEDED"].includes(error.code) && attempt < 4) { await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt + Math.random() * 50)); continue; }
        throw new ServiceError(503, "storage-unavailable", "Penyimpanan server belum memberi konfirmasi. Coba lagi dengan permintaan yang sama; kuota tidak akan dihitung dua kali.");
      }
    }
    throw new ServiceError(503, "storage-unavailable", "Penyimpanan server belum tersedia.");
  } };
}
