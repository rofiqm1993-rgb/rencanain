import { decodeProtectedHeader, importX509, jwtVerify } from "jose";
import { UserFacingError } from "./user-errors";
let certificates: { values: Record<string, string>; expiresAt: number } | null = null;
export async function verifyFirebaseToken(token: string, projectId: string) {
  const header = decodeProtectedHeader(token);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid token");
  if (!certificates || certificates.expiresAt < Date.now() || !certificates.values[header.kid]) {
    try {
      const response = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com", { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Certificate unavailable");
      const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] || 300);
      certificates = { values: await response.json() as Record<string, string>, expiresAt: Date.now() + maxAge * 1000 };
    } catch { throw new UserFacingError("auth-service", "Pemeriksaan sesi akun sedang tidak tersedia. Tunggu beberapa saat lalu coba lagi; Anda tidak perlu mengganti kata sandi."); }
  }
  const certificate = certificates.values[header.kid];
  if (!certificate) throw new Error("Unknown signing key");
  const key = await importX509(certificate, "RS256");
  const { payload } = await jwtVerify(token, key, { algorithms: ["RS256"], issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, requiredClaims: ["exp", "iat", "sub", "auth_time"] });
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || payload.sub.length > 128 || Number(payload.iat) > now || Number(payload.auth_time) > now) throw new Error("Invalid token claims");
  return payload.sub;
}
