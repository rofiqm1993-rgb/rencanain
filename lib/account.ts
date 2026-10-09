export type AccountSnapshot = {
  package: "free" | "pro"; status: "beta" | "active" | "expired"; readOnly: boolean;
  limit: number; used: number; reserved: number; remaining: number; expiresAt: string | null;
};

// Ringkasan status pembayaran untuk UI. Tidak pernah memuat kunci apa pun.
export type PaymentInfo = {
  ready: boolean; keyPresent: boolean; mode: "sandbox" | "production"; price: number; days: number;
};

// Format tanggal ringkas untuk tampilan paket: "8 Nov 2026" (zona waktu Jakarta).
const tanggalJakarta = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
export function tanggalRingkas(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : tanggalJakarta.format(date);
}
