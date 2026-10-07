import { runtimeValues } from "./server-runtime";
import { verifyFirebaseToken } from "./server-auth";
import { ServiceError } from "./server-store";
import { UserFacingError } from "./user-errors";
export async function requestOwner(request: Request, mutation = false): Promise<string> {
  if (mutation && request.headers.get("origin") !== new URL(request.url).origin) throw new ServiceError(403, "origin", "Permintaan harus berasal dari Rencanain.");
  const config = runtimeValues(), token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token || !config.firebase) throw new ServiceError(401, "session", "Masuk terlebih dahulu untuk menggunakan akun Rencanain.");
  try { return await verifyFirebaseToken(token, config.firebase.projectId); }
  catch (e) { if (e instanceof UserFacingError && e.code === "auth-service") throw new ServiceError(503, "auth-service", e.message); throw new ServiceError(401, "session", "Sesi akun sudah berakhir. Masuk kembali; draft di browser tetap tersedia."); }
}
export async function requestBody(request: Request, limit = 200000): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new ServiceError(413, "input-size", "Input terlalu panjang.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > limit) throw new ServiceError(413, "input-size", "Input terlalu panjang.");
  try { return JSON.parse(raw); } catch { throw new ServiceError(400, "input", "Format input tidak valid."); }
}
export function apiResult(value: unknown) { return Response.json(value, { headers: { "Cache-Control": "no-store" } }); }
export function apiError(error: unknown) {
  const e = error instanceof ServiceError ? error : new ServiceError(503, "server-unavailable", "Layanan server belum tersedia. Coba kembali; draft dan proyek sebelumnya tetap tersedia.");
  return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: { "Cache-Control": "no-store" } });
}
