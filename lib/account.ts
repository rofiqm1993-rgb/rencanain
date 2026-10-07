export type AccountSnapshot = {
  package: "free" | "pro"; status: "beta" | "active" | "expired"; readOnly: boolean;
  limit: number; used: number; reserved: number; remaining: number; expiresAt: string | null;
};

// Ringkasan status pembayaran untuk UI. Tidak pernah memuat kunci apa pun.
export type PaymentInfo = {
  ready: boolean; keyPresent: boolean; mode: "sandbox" | "production"; price: number; days: number;
};
