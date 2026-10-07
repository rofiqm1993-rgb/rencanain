declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FIREBASE_SERVICE_ACCOUNT_JSON?: string;
    BETA_FREE_PRD_LIMIT?: string;
    BETA_PRO_PRD_LIMIT?: string;
    BETA_FREE_QUOTA_MODE?: "once" | "monthly";
    // Midtrans: Server Key wajib bertipe Secret. Sandbox hanya untuk pengujian.
    MIDTRANS_SERVER_KEY?: string;
    MIDTRANS_CLIENT_KEY?: string;
    MIDTRANS_MERCHANT_ID?: string;
    MIDTRANS_SANDBOX_SERVER_KEY?: string;
    MIDTRANS_SANDBOX_CLIENT_KEY?: string;
    MIDTRANS_SANDBOX_MERCHANT_ID?: string;
    MIDTRANS_SANDBOX_TEST_UID?: string;
    MIDTRANS_SANDBOX?: string;
    MIDTRANS_PRO_PRICE?: string;
    MIDTRANS_PRO_DAYS?: string;
  }
}
