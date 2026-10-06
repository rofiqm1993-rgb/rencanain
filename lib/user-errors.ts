export type ErrorContext = "generate" | "login" | "load" | "save" | "task" | "config";
export class UserFacingError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "UserFacingError"; }
}
export function userError(error: unknown, context: ErrorContext): string {
  if (error instanceof UserFacingError) return error.message;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^firestore\//, "") : "";
  const auth: Record<string, string> = {
    "auth/invalid-credential": "Email atau kata sandi belum cocok. Periksa kembali lalu coba masuk lagi.",
    "auth/wrong-password": "Email atau kata sandi belum cocok. Periksa kembali lalu coba masuk lagi.",
    "auth/user-not-found": "Email atau kata sandi belum cocok. Periksa kembali lalu coba masuk lagi.",
    "auth/email-already-in-use": "Email ini sudah terdaftar. Gunakan menu masuk.",
    "auth/weak-password": "Gunakan kata sandi minimal 6 karakter.",
    "auth/invalid-email": "Alamat email belum valid. Periksa penulisannya.",
    "auth/operation-not-allowed": "Metode login ini belum tersedia. Coba metode lain atau mode demo.",
    "auth/configuration-not-found": "Login akun belum tersedia. Anda dapat melanjutkan dengan mode demo.",
    "auth/unauthorized-domain": "Login belum diizinkan pada alamat ini. Untuk preview lokal, buka localhost atau gunakan mode demo.",
    "auth/popup-closed-by-user": "Jendela login ditutup sebelum selesai. Buka kembali saat Anda siap.",
    "auth/cancelled-popup-request": "Permintaan login sebelumnya dibatalkan. Coba masuk kembali.",
    "auth/popup-blocked": "Browser memblokir jendela login. Izinkan popup lalu coba lagi.",
    "auth/network-request-failed": "Koneksi login terputus. Periksa internet lalu coba masuk kembali.",
    "auth/too-many-requests": "Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.",
    "auth/user-disabled": "Akun ini belum dapat digunakan. Hubungi pengelola aplikasi atau gunakan mode demo.",
    "auth/user-token-expired": "Sesi akun sudah berakhir. Masuk kembali; draft di browser tetap tersedia.",
    "auth/invalid-user-token": "Sesi akun sudah berakhir. Masuk kembali; draft di browser tetap tersedia.",
    "auth/requires-recent-login": "Masuk kembali untuk melanjutkan tindakan ini.",
    "auth/account-exists-with-different-credential": "Email ini memakai metode login lain. Masuk dengan metode yang digunakan saat mendaftar.",
  };
  if (auth[code]) return auth[code];
  if (code === "permission-denied") return "Akses proyek belum diizinkan. Pastikan Anda memakai akun yang benar. Jika tetap gagal, pengelola perlu memeriksa aturan akses Firestore.";
  if (code === "unauthenticated") return "Sesi akun sudah berakhir. Masuk kembali untuk mengakses proyek; draft di browser tetap tersedia.";
  if (["unavailable", "deadline-exceeded", "aborted"].includes(code)) return context === "load" ? "Proyek belum dapat dimuat. Periksa koneksi internet lalu tekan Coba lagi." : "Perubahan belum berhasil disimpan. Periksa koneksi lalu coba lagi; tampilan belum ditandai berhasil.";
  if (code === "resource-exhausted") return "Layanan penyimpanan sedang mencapai batas penggunaan. Tunggu beberapa saat lalu coba lagi.";
  if (code === "failed-precondition") return "Penyimpanan belum siap untuk permintaan ini. Coba lagi nanti; jika berulang, pengelola perlu memeriksa konfigurasi Firestore.";
  if (code === "not-found") return "Proyek ini sudah tidak tersedia. Muat ulang daftar proyek sebelum melanjutkan.";
  if (typeof error === "object" && error !== null && "name" in error) {
    if (["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(String(error.name))) return "Penyimpanan browser penuh. Ekspor PRD terlebih dahulu, lalu kosongkan ruang penyimpanan sebelum mencoba lagi.";
    if (error.name === "SecurityError") return "Browser membatasi penyimpanan lokal. Izinkan penyimpanan situs atau gunakan browser lain. Ekspor PRD sebelum menutup halaman.";
    if (error.name === "TimeoutError") return "Layanan belum merespons tepat waktu. Periksa koneksi lalu coba lagi.";
  }
  const fallback: Record<ErrorContext, string> = {
    generate: "PRD belum dapat disusun. Periksa koneksi lalu coba lagi, atau pilih contoh lokal. Ide dan jawaban Anda tetap tersedia.",
    login: "Login belum berhasil. Coba lagi atau gunakan metode login lain.",
    load: "Proyek belum dapat dimuat. Tekan Coba lagi; data tersimpan tidak dihapus.",
    save: "Proyek belum berhasil disimpan. PRD tetap ada di halaman ini dan dapat diekspor. Coba lagi setelah koneksi pulih.",
    task: "Perubahan tugas belum berhasil disimpan. Status sebelumnya tetap dipakai. Silakan coba lagi.",
    config: "Konfigurasi aplikasi belum dapat dimuat. Muat ulang saat koneksi pulih; mode demo tetap tersedia.",
  };
  return fallback[context];
}
export function requireConnection() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new UserFacingError("offline", "Anda sedang offline. Sambungkan internet lalu coba lagi. Draft dan PRD yang sudah tampil tetap dapat ditinjau atau diekspor.");
}

// Only time out reads: queued Firestore writes can still commit after a timeout.
export function readWithTimeout<T>(operation: Promise<T>, timeoutMs = 15000, message = "Proyek belum dapat dimuat karena koneksi terlalu lama. Periksa internet lalu tekan Coba lagi.", signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); };
    const onAbort = () => { cleanup(); reject(new UserFacingError("cancelled", "Penyusunan dibatalkan. Ide, jawaban, dan hasil sebelumnya tetap tersedia.")); };
    const timer = setTimeout(() => { cleanup(); reject(new UserFacingError("read-timeout", message)); }, timeoutMs);
    operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal?.aborted) onAbort(); else signal?.addEventListener("abort", onAbort, { once: true });
  });
}
export async function withPendingNotice<T>(operation: Promise<T>, onPending: () => void, delayMs = 15000): Promise<T> {
  const timer = setTimeout(onPending, delayMs);
  try { return await operation; } finally { clearTimeout(timer); }
}
