import { env } from "cloudflare:workers";
import type { PaymentInfo } from "./account";
export type PublicConfig = { firebase: { apiKey: string; authDomain: string; projectId: string; storageBucket: string; messagingSenderId: string; appId: string } | null; aiReady: boolean; quotaReady: boolean; model: string; payments: PaymentInfo };
export function runtimeValues() {
  const values = env as unknown as Record<string, string | undefined>;
  const firebase = { apiKey: values.FIREBASE_API_KEY || "", authDomain: values.FIREBASE_AUTH_DOMAIN || "", projectId: values.FIREBASE_PROJECT_ID || "", storageBucket: values.FIREBASE_STORAGE_BUCKET || "", messagingSenderId: values.FIREBASE_MESSAGING_SENDER_ID || "", appId: values.FIREBASE_APP_ID || "" };
  const limit = (value: string | undefined, fallback: number) => { if (!value) return fallback; const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > 1000) throw new Error("Invalid quota limit configuration"); return n; };
  // Harga dan masa aktif Pro hanya ditentukan server. Di luar batas -> gagal tertutup.
  const amount = (value: string | undefined, fallback: number) => { if (!value) return fallback; const n = Number(value); if (!Number.isSafeInteger(n) || n < 1000 || n > 100000000) throw new Error("Invalid Pro price configuration"); return n; };
  const proDays = (value: string | undefined) => { if (!value) return 30; const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > 365) throw new Error("Invalid Pro duration configuration"); return n; };
  const mode = values.BETA_FREE_QUOTA_MODE || "once";
  if (!["once", "monthly"].includes(mode)) throw new Error("Invalid quota mode configuration");
  const sandboxMode = (values.MIDTRANS_SANDBOX || "").trim().toLowerCase();
  if (!["", "0", "false", "1", "true"].includes(sandboxMode)) throw new Error("Invalid Midtrans environment configuration");
  const sandbox = sandboxMode === "1" || sandboxMode === "true";
  const midtrans = { serverKey: (sandbox ? values.MIDTRANS_SANDBOX_SERVER_KEY : values.MIDTRANS_SERVER_KEY)?.trim() || "", clientKey: (sandbox ? values.MIDTRANS_SANDBOX_CLIENT_KEY : values.MIDTRANS_CLIENT_KEY)?.trim() || "", merchantId: (sandbox ? values.MIDTRANS_SANDBOX_MERCHANT_ID : values.MIDTRANS_MERCHANT_ID)?.trim() || "", testUid: sandbox ? values.MIDTRANS_SANDBOX_TEST_UID?.trim() || "" : "", sandbox, price: amount(values.MIDTRANS_PRO_PRICE, 49000), days: proDays(values.MIDTRANS_PRO_DAYS) };
  const keyModeMatches = sandbox ? midtrans.serverKey.startsWith("SB-Mid-server-") && midtrans.clientKey.startsWith("SB-Mid-client-") : midtrans.serverKey.startsWith("Mid-server-") && midtrans.clientKey.startsWith("Mid-client-");
  // On the live Firestore project, only one explicitly selected test account may use simulated payments.
  const sandboxStorageSafe = !sandbox || firebase.projectId !== "rencanain-c2aae" || /^[^/\s]{1,128}$/.test(midtrans.testUid);
  return { key: values.DEEPSEEK_API_KEY?.trim() || "", model: values.DEEPSEEK_MODEL?.trim() || "deepseek-flash", firebase: Object.values(firebase).every(v => v.trim()) ? firebase : null, serviceAccount: values.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || "", quotaPolicy: { freeLimit: limit(values.BETA_FREE_PRD_LIMIT, 1), proLimit: limit(values.BETA_PRO_PRD_LIMIT, 30), freeMonthly: mode === "monthly" }, midtrans: { ...midtrans, ready: !!midtrans.serverKey && !!midtrans.clientKey && !!midtrans.merchantId && keyModeMatches && sandboxStorageSafe } };
}
export function publicConfig(): PublicConfig { const v = runtimeValues(); return { firebase: v.firebase, aiReady: !!v.key && !!v.serviceAccount && !!v.firebase, quotaReady: !!v.serviceAccount && !!v.firebase, model: v.model, payments: { ready: v.midtrans.ready && !!v.serviceAccount && !!v.firebase, keyPresent: !!v.midtrans.serverKey, mode: v.midtrans.sandbox ? "sandbox" : "production", price: v.midtrans.price, days: v.midtrans.days } }; }
