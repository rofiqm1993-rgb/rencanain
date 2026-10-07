import { generatedPlanSchema, type GeneratedPlan } from "./prd";
import { decodeProjectFromFirestore, encodeProjectForFirestore } from "./project-firestore-codec";
import { ServiceError, type RecordData, type Transaction, type TransactionalStore } from "./server-store";
import type { AccountSnapshot } from "./account";

export const LEASE_MS = 10 * 60 * 1000;
export type QuotaPolicy = { freeLimit: number; proLimit: number; freeMonthly: boolean };
type Hold = { until: number; hash: string };
type Budget = { used: number; reservations: Record<string, Hold> };
export async function fingerprint(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export function ownerPath(uid: string) {
  if (!uid || uid.includes("/") || uid === "." || uid === "..") throw new ServiceError(401, "session", "Sesi akun tidak valid. Masuk kembali.");
  return `users/${uid}`;
}
export function validRequestId(id: unknown): id is string { return typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id); }
export async function entitlement(tx: Transaction, uid: string, now: number, policy: QuotaPolicy) {
  const root = ownerPath(uid), path = `${root}/billing/account`;
  const value = await tx.get(path);
  const account = value || { package: "free", createdAt: new Date(now).toISOString() };
  if (!value) tx.set(path, account);
  if (account.package === "free") return { package: "free" as const, status: "beta" as const, readOnly: false, expiresAt: null, limit: policy.freeLimit, period: policy.freeMonthly ? `free-${new Date(now).toISOString().slice(0, 7)}` : "free-lifetime" };
  const start = typeof account.proStartedAt === "string" ? Date.parse(account.proStartedAt) : NaN;
  const end = typeof account.proExpiresAt === "string" ? Date.parse(account.proExpiresAt) : NaN;
  if (account.package !== "pro" || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || start > now) throw new ServiceError(503, "account-data", "Status paket belum dapat diverifikasi. Hubungi pengelola; proyek lama tetap bisa dibaca dan diekspor.");
  const expired = now >= end;
  return { package: "pro" as const, status: expired ? "expired" as const : "active" as const, readOnly: expired, expiresAt: new Date(end).toISOString(), limit: policy.proLimit, period: `pro-${start}` };
}
function budget(value: RecordData | null, now: number): Budget {
  const used = value?.used ?? 0;
  if (!Number.isSafeInteger(used) || Number(used) < 0) throw new ServiceError(503, "quota-data", "Catatan kuota perlu diperiksa pengelola.");
  const holds = value?.reservations ?? {};
  if (!holds || typeof holds !== "object" || Array.isArray(holds)) throw new ServiceError(503, "quota-data", "Catatan kuota perlu diperiksa pengelola.");
  const reservations: Record<string, Hold> = {};
  for (const [id, hold] of Object.entries(holds)) {
    const h = hold as Hold;
    if (!h || !Number.isFinite(h.until) || typeof h.hash !== "string") throw new ServiceError(503, "quota-data", "Catatan reservasi kuota perlu diperiksa pengelola.");
    if (h.until > now) reservations[id] = h;
  }
  return { used: Number(used), reservations };
}
export function requireWritable(account: { readOnly: boolean }) { if (account.readOnly) throw new ServiceError(403, "pro-expired", "Masa aktif Pro berakhir. Proyek lama tetap dapat dibaca dan diekspor; pembuatan proyek dan perubahan tugas dinonaktifkan."); }
function decodePlan(value: unknown) { return generatedPlanSchema.parse(decodeProjectFromFirestore(value)); }
function encodePlan(plan: GeneratedPlan) { return encodeProjectForFirestore({ ...plan, id: "generation", savedAt: plan.generatedAt, tasks: {} }); }
export function quotaService(store: TransactionalStore, policy: QuotaPolicy, clock = Date.now) {
  return {
    async generation(uid: string, id: string) {
      if (!validRequestId(id)) throw new ServiceError(400, "request-id", "ID permintaan tidak valid.");
      return store.run(async tx => {
        const job = await tx.get(`${ownerPath(uid)}/generations/${id}`);
        if (!job) return { status: "missing", plan: null };
        if (job.status === "completed") return { status: "completed", plan: decodePlan(job.result) };
        return { status: job.status === "pending" && Number(job.reservedUntil) > clock() ? "pending" : "failed", plan: null };
      });
    },
    async snapshot(uid: string): Promise<AccountSnapshot> {
      return store.run(async tx => {
        const now = clock(), a = await entitlement(tx, uid, now, policy);
        const path = `${ownerPath(uid)}/quota/${a.period}`, previous = await tx.get(path), q = budget(previous, now);
        if (!previous || Object.keys((previous.reservations || {}) as Record<string, unknown>).length !== Object.keys(q.reservations).length) tx.set(path, { ...q, updatedAt: new Date(now).toISOString() });
        const reserved = Object.keys(q.reservations).length;
        return { package: a.package, status: a.status, readOnly: a.readOnly, expiresAt: a.expiresAt, limit: a.limit, used: q.used, reserved, remaining: a.readOnly ? 0 : Math.max(0, a.limit - q.used - reserved) };
      });
    },
    async reserve(uid: string, id: string, hash: string): Promise<{ plan: GeneratedPlan; lease?: never } | { plan: null; lease: string }> {
      if (!validRequestId(id)) throw new ServiceError(400, "request-id", "ID permintaan tidak valid.");
      return store.run(async tx => {
        const now = clock(), root = ownerPath(uid), jobPath = `${root}/generations/${id}`, job = await tx.get(jobPath);
        if (job && job.inputHash !== hash) throw new ServiceError(409, "request-conflict", "ID permintaan sudah digunakan untuk input berbeda.");
        if (job?.status === "completed") return { plan: decodePlan(job.result) };
        const a = await entitlement(tx, uid, now, policy); requireWritable(a);
        if (job?.status === "pending" && Number(job.reservedUntil) > now) throw new ServiceError(409, "generation-pending", "Permintaan ini masih diproses. Tunggu sebentar, lalu coba lagi untuk mengambil hasilnya.");
        const path = `${root}/quota/${a.period}`, q = budget(await tx.get(path), now);
        if (q.used + Object.keys(q.reservations).length >= a.limit) throw new ServiceError(429, "quota-exhausted", "Kuota PRD AI sudah habis atau sedang dipakai oleh permintaan lain. Proyek yang tersimpan tetap dapat dibaca dan diekspor.");
        const until = now + LEASE_MS;
        // A new attempt receives a unique lease, preventing an old timed-out attempt from committing or releasing it.
        const lease = crypto.randomUUID();
        q.reservations[id] = { until, hash: lease };
        tx.set(path, { ...q, updatedAt: new Date(now).toISOString() });
        tx.set(jobPath, { status: "pending", inputHash: hash, period: a.period, reservedUntil: until, lease, createdAt: job?.createdAt || new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
        return { plan: null, lease };
      });
    },
    async complete(uid: string, id: string, lease: string, plan: GeneratedPlan): Promise<GeneratedPlan> {
      return store.run(async tx => {
        const now = clock(), root = ownerPath(uid), jobPath = `${root}/generations/${id}`, job = await tx.get(jobPath);
        if (job?.status === "completed") return decodePlan(job.result);
        if (!job || job.status !== "pending" || job.lease !== lease || Number(job.reservedUntil) <= now) throw new ServiceError(409, "generation-state", "Waktu reservasi berakhir. Coba kembali; permintaan ini tidak mengurangi kuota.");
        const a = await entitlement(tx, uid, now, policy); requireWritable(a);
        if (a.period !== job.period) throw new ServiceError(409, "package-changed", "Paket berubah selama penyusunan. Coba kembali menggunakan paket saat ini.");
        const path = `${root}/quota/${a.period}`, q = budget(await tx.get(path), now);
        if (q.reservations[id]?.hash !== lease || q.used >= a.limit) throw new ServiceError(409, "generation-state", "Reservasi kuota tidak lagi aktif.");
        const result = generatedPlanSchema.parse({ ...plan, generationId: id });
        q.used += 1; delete q.reservations[id];
        tx.set(path, { ...q, updatedAt: new Date(now).toISOString() });
        tx.set(jobPath, { ...job, status: "completed", result: encodePlan(result), updatedAt: new Date(now).toISOString() });
        return result;
      });
    },
    async release(uid: string, id: string, lease: string) {
      await store.run(async tx => {
        const now = clock(), root = ownerPath(uid), jobPath = `${root}/generations/${id}`, job = await tx.get(jobPath);
        if (!job || job.status !== "pending" || job.lease !== lease) return;
        const path = `${root}/quota/${String(job.period)}`, q = budget(await tx.get(path), now);
        if (q.reservations[id]?.hash === lease) delete q.reservations[id];
        tx.set(path, { ...q, updatedAt: new Date(now).toISOString() });
        tx.set(jobPath, { ...job, status: "failed", updatedAt: new Date(now).toISOString() });
      });
    },
  };
}
