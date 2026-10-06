import { UserFacingError, requireConnection } from "./user-errors";
export async function requestJSON<T>(url: string, init: RequestInit = {}, timeoutMs = 105000): Promise<T> {
  requireConnection();
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal;
  try {
    const response = await fetch(url, { ...init, signal });
    let body: unknown;
    try { body = await response.json(); }
    catch (e) { if (signal.aborted) throw e; throw new UserFacingError("invalid-response", "Respons layanan belum dapat dibaca. Coba lagi beberapa saat; hasil sebelumnya tetap tersedia."); }
    if (!response.ok) {
      const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" && body.error.length <= 600 ? body.error : response.status === 401 ? "Sesi akun sudah berakhir. Masuk kembali sebelum melanjutkan." : response.status === 429 ? "Layanan sedang membatasi permintaan. Tunggu beberapa menit lalu coba lagi." : "Layanan sedang bermasalah. Coba lagi beberapa saat; draft Anda tetap tersedia.";
      throw new UserFacingError(`http-${response.status}`, message);
    }
    return body as T;
  } catch (error) {
    if (init.signal?.aborted) throw new UserFacingError("cancelled", "Penyusunan dibatalkan. Ide, jawaban, dan hasil sebelumnya tetap tersedia.");
    if (deadline.signal.aborted) throw new UserFacingError("request-timeout", "Layanan belum merespons tepat waktu. Coba lagi setelah koneksi pulih. Ide, jawaban, dan hasil sebelumnya tetap tersedia.");
    if (error instanceof UserFacingError) throw error;
    throw new UserFacingError("network", "Koneksi ke layanan terputus. Periksa internet lalu coba lagi; draft Anda tetap tersedia.");
  } finally { clearTimeout(timer); }
}
