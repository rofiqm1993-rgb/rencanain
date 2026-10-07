// Uji jalur pembayaran Midtrans tanpa uang nyata, tanpa Firestore asli, dan tanpa menghubungi Midtrans.
// Yang dibuktikan: bentuk permintaan Snap, verifikasi tanda tangan webhook, jumlah yang tidak sesuai,
// idempotensi, perpanjangan yang MENAMBAH dari tanggal berakhir, dan pencabutan saat refund.
import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { TransactionFixture } from "./transaction-fixture.mjs";

await mkdir("outputs", { recursive: true });
await build({
  stdin: { contents: 'export * from "./lib/server-billing.ts"; export * from "./lib/server-runtime.ts"; export * from "./lib/server-quota.ts"; export { POST as transaction } from "./app/api/transaction/route.ts"; export { POST as webhook } from "./app/api/webhook/midtrans/route.ts";', resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", outfile: "outputs/billing-test-module.mjs",
  plugins: [{ name: "billing-fixture", setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "fixture" }));
    // Identitas Firebase punya pengujiannya sendiri; token "fixture:<uid>" cukup untuk uji pembayaran.
    b.onResolve({ filter: /server-auth$/ }, () => ({ path: "auth", namespace: "fixture" }));
    // Penyimpanan tiruan menggantikan Firestore REST, tetapi seluruh logika billing tetap kode asli.
    b.onResolve({ filter: /^@\/lib\/server-store$/ }, () => ({ path: "store", namespace: "fixture" }));
    b.onResolve({ filter: /^@\// }, a => ({ path: resolve(a.path.replace("@/", "")) + ".ts" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: a.path === "env" ? "export const env = globalThis.runtimeEnv;" : a.path === "auth" ? 'export async function verifyFirebaseToken(token) { if (!token.startsWith("fixture:")) throw new Error("invalid"); return token.slice(8); }' : 'export * from "./lib/server-store.ts";\nexport function createFirestoreStore() { return globalThis.__store; }', loader: "js", resolveDir: process.cwd() }));
  } }],
});
const KEY = "SB-Mid-server-fixture", CLIENT_KEY = "SB-Mid-client-fixture", MERCHANT_ID = "G-fixture", ORIGIN = "https://rencanain.test";
// Lingkungan tiruan HARUS siap sebelum modul bundel diimpor: env dibaca saat modul dimuat.
globalThis.runtimeEnv = {
  FIREBASE_PROJECT_ID: "fixture", FIREBASE_API_KEY: "fixture", FIREBASE_AUTH_DOMAIN: "fixture", FIREBASE_STORAGE_BUCKET: "fixture",
  FIREBASE_MESSAGING_SENDER_ID: "fixture", FIREBASE_APP_ID: "fixture", FIREBASE_SERVICE_ACCOUNT_JSON: "{}",
  BETA_FREE_PRD_LIMIT: "1", BETA_PRO_PRD_LIMIT: "30", BETA_FREE_QUOTA_MODE: "once",
  MIDTRANS_SERVER_KEY: "Mid-server-production-fixture", MIDTRANS_CLIENT_KEY: "Mid-client-production-fixture", MIDTRANS_MERCHANT_ID: "G-production-fixture",
  MIDTRANS_SANDBOX_SERVER_KEY: KEY, MIDTRANS_SANDBOX_CLIENT_KEY: CLIENT_KEY, MIDTRANS_SANDBOX_MERCHANT_ID: MERCHANT_ID,
  MIDTRANS_SANDBOX: "1", MIDTRANS_PRO_PRICE: "49000", MIDTRANS_PRO_DAYS: "30",
};
globalThis.__store = new TransactionFixture();
const store = globalThis.__store;
const m = await import("../outputs/billing-test-module.mjs");
let snapCalls = 0, snapBody = null, snapFailure = null;
globalThis.fetch = async (url, init = {}) => {
  const target = new URL(url);
  assert(target.hostname.endsWith("midtrans.com"), `Uji tidak boleh menghubungi ${target.hostname}`);
  snapCalls += 1;
  assert.equal(init.headers.Authorization, `Basic ${Buffer.from(`${KEY}:`).toString("base64")}`);
  snapBody = JSON.parse(init.body);
  if (snapFailure === "unauthorized") return Response.json({ status_message: "Unknown Merchant server_key/id" }, { status: 401 });
  if (snapFailure === "offline") throw new TypeError("jaringan uji mati");
  return Response.json({ token: `token-${snapCalls}`, redirect_url: `https://app.sandbox.midtrans.com/snap/v1/redirection/token-${snapCalls}` });
};
const config = () => m.runtimeValues().midtrans;
const policy = { freeLimit: 1, proLimit: 30, freeMonthly: false };
const snapshot = (uid = "buyer", at) => m.quotaService(store, policy, at ? () => at : Date.now).snapshot(uid);
const snapRequest = (uid = "buyer", origin = ORIGIN) => new Request(`${origin}/api/transaction`, { method: "POST", headers: { authorization: `Bearer fixture:${uid}`, origin, "content-type": "application/json" }, body: "{}" });
async function buy(uid = "buyer") {
  const response = await m.transaction(snapRequest(uid));
  const body = await response.json();
  assert.equal(response.status, 200, `Pesanan harus dibuat, dapat ${response.status}: ${JSON.stringify(body)}`);
  return body;
}
async function sendWebhook(payload) {
  const response = await m.webhook(new Request(`${ORIGIN}/api/webhook/midtrans`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
  return { status: response.status, body: await response.json() };
}
async function notification(orderId, transactionStatus, { gross = "49000.00", statusCode = "200", fraud, paymentType = "gopay" } = {}) {
  return { order_id: orderId, status_code: statusCode, gross_amount: gross, transaction_status: transactionStatus, merchant_id: MERCHANT_ID, ...(fraud ? { fraud_status: fraud } : {}), payment_type: paymentType, transaction_id: `trx-${orderId}`, signature_key: await m.signature(KEY, orderId, statusCode, gross) };
}

// 1. Konfigurasi server: harga, masa aktif, dan kesiapan pembayaran.
assert.equal(m.runtimeValues().midtrans.price, 49000);
assert.equal(m.runtimeValues().midtrans.days, 30);
assert.equal(m.runtimeValues().midtrans.sandbox, true);
assert.equal(m.runtimeValues().midtrans.serverKey, KEY);
assert.equal(m.runtimeValues().midtrans.clientKey, CLIENT_KEY);
assert.equal(m.runtimeValues().midtrans.merchantId, MERCHANT_ID);
assert.equal(m.publicConfig().payments.ready, true);
assert.equal(m.publicConfig().payments.keyPresent, true);
globalThis.runtimeEnv.MIDTRANS_SANDBOX = "0";
assert.equal(m.runtimeValues().midtrans.serverKey, "Mid-server-production-fixture");
assert.equal(m.runtimeValues().midtrans.clientKey, "Mid-client-production-fixture");
assert.equal(m.runtimeValues().midtrans.merchantId, "G-production-fixture");
assert.equal(m.publicConfig().payments.mode, "production");
globalThis.runtimeEnv.MIDTRANS_SANDBOX = "1";
globalThis.runtimeEnv.FIREBASE_PROJECT_ID = "rencanain-c2aae";
assert.equal(m.publicConfig().payments.ready, false, "Sandbox tidak boleh mengaktifkan Pro di Firestore produksi");
assert.equal((await m.transaction(snapRequest())).status, 503);
globalThis.runtimeEnv.MIDTRANS_SANDBOX_TEST_UID = "buyer";
assert.equal(m.publicConfig().payments.ready, true, "Akun uji eksplisit boleh memakai Sandbox di Worker utama");
assert.equal((await m.transaction(snapRequest("outsider"))).status, 403);
assert.equal(store.data.size, 0, "Akun di luar daftar uji tidak boleh membuat pesanan");
globalThis.runtimeEnv.FIREBASE_PROJECT_ID = "fixture";
globalThis.runtimeEnv.MIDTRANS_SANDBOX_TEST_UID = "";

// 2. Penjaga origin dan sesi: pembuatan pesanan tidak bisa dipicu dari situs lain atau tanpa login.
assert.equal((await m.transaction(new Request(`${ORIGIN}/api/transaction`, { method: "POST", headers: { origin: "https://jahat.test", authorization: "Bearer fixture:buyer" }, body: "{}" }))).status, 403);
assert.equal((await m.transaction(new Request(`${ORIGIN}/api/transaction`, { method: "POST", headers: { origin: ORIGIN }, body: "{}" }))).status, 401);
assert.equal(store.data.size, 0, "Permintaan yang ditolak tidak boleh membuat pesanan");

// 3. Permintaan Snap memuat harga dari server, bukan dari browser.
const order1 = await buy();
assert.equal(snapCalls, 1);
assert.match(snapBody.transaction_details.order_id, /^RN-buyer-/);
assert.equal(snapBody.transaction_details.gross_amount, 49000);
assert.equal(snapBody.item_details[0].price, 49000);
assert.equal(snapBody.item_details[0].quantity, 1);
assert.equal(snapBody.callbacks.finish, `${ORIGIN}/pengaturan?bayar=selesai`);
assert.deepEqual(snapBody.expiry, { unit: "hours", duration: 24 });
assert.equal(order1.amount, 49000);
assert.match(order1.redirectUrl, /^https:\/\/app\.sandbox\.midtrans\.com\/snap\//);
const stored = store.data.get(`orders/${order1.orderId}`);
assert.equal(stored.status, "pending"); assert.equal(stored.uid, "buyer"); assert.equal(stored.amount, 49000); assert.equal(stored.days, 30);
assert.equal((await snapshot()).package, "free", "Belum membayar berarti tetap Beta Gratis");

// 4. Kendali negatif: tanda tangan palsu, kunci lain, pesanan tak dikenal, jumlah tidak sesuai.
const forged = { ...(await notification(order1.orderId, "settlement")), signature_key: "a".repeat(128) };
assert.equal((await sendWebhook(forged)).status, 401);
const foreign = { ...(await notification(order1.orderId, "settlement")), signature_key: await m.signature("kunci-milik-orang-lain", order1.orderId, "200", "49000.00") };
assert.equal((await sendWebhook(foreign)).status, 401);
assert.equal((await sendWebhook(await notification("RN-buyer-pesanan-karangan", "settlement"))).status, 400);
assert.equal((await sendWebhook(await notification(order1.orderId, "settlement", { gross: "1000.00" }))).status, 403);
assert.equal((await sendWebhook({ ...(await notification(order1.orderId, "settlement")), merchant_id: "G-other" })).status, 403);
assert.equal((await sendWebhook(await notification(order1.orderId, "settlement", { statusCode: "202" }))).status, 403);
assert.equal((await sendWebhook(await notification(order1.orderId, "settlement", { fraud: "deny" }))).status, 403);
assert.equal((await snapshot()).package, "free", "Notifikasi yang gagal tidak boleh mengaktifkan Pro");
assert.equal(store.data.get(`orders/${order1.orderId}`).status, "pending");

// 5. pending dan capture/challenge belum membuka akses.
assert.equal((await sendWebhook(await notification(order1.orderId, "pending"))).status, 200);
assert.equal((await snapshot()).package, "free");

// 6. settlement mengaktifkan Pro tepat sekali, dan kiriman ulang tidak menambah apa pun.
const paid = await sendWebhook(await notification(order1.orderId, "settlement"));
assert.equal(paid.status, 200); assert.equal(paid.body.action, "activated");
const active = await snapshot();
assert.equal(active.package, "pro"); assert.equal(active.limit, 30); assert.equal(active.remaining, 30); assert.equal(active.readOnly, false);
const account = store.data.get("users/buyer/billing/account");
assert.equal(account.package, "pro"); assert.equal(account.lastOrderId, order1.orderId);
const firstExpiry = account.proExpiresAt;
assert(Date.parse(firstExpiry) - Date.now() > 29 * 86_400_000, "Masa aktif harus sekitar 30 hari");
assert(store.data.has(`users/buyer/quota/pro-${Date.parse(account.proStartedAt)}`), "Periode kuota Pro harus terbentuk");
assert.equal((await sendWebhook(await notification(order1.orderId, "settlement"))).body.action, "unchanged");
assert.equal(store.data.get("users/buyer/billing/account").proExpiresAt, firstExpiry, "Kiriman ulang tidak boleh menambah masa aktif");
assert.equal((await snapshot()).remaining, 30, "Kiriman ulang tidak boleh menambah kuota");
const expired = await snapshot("buyer", Date.parse(firstExpiry) + 1);
assert.equal(expired.status, "expired"); assert.equal(expired.readOnly, true); assert.equal(expired.remaining, 0);

// 7. Perpanjangan MENAMBAH dari tanggal berakhir, bukan menghitung ulang dari hari pembayaran.
const now = Date.parse(firstExpiry) - 20 * 86_400_000;
const service = m.billingService(store, config(), () => now);
const order2 = await service.create("buyer", ORIGIN);
assert.equal((await service.notify(await notification(order2.orderId, "settlement"))).action, "activated");
const renewed = store.data.get("users/buyer/billing/account");
assert.equal(Date.parse(renewed.proExpiresAt) - Date.parse(firstExpiry), 30 * 86_400_000, "Perpanjangan harus menambah 30 hari dari tanggal berakhir");
const repeated = await snapshot("buyer", now);
assert.equal(repeated.package, "pro"); assert.equal(repeated.remaining, 30, "Periode Pro baru membawa kuota baru");

// 8. Refund mencabut hak Pro; notifikasi sukses setelahnya tidak mengaktifkan ulang.
assert.equal((await service.notify(await notification(order2.orderId, "chargeback"))).action, "revoked");
assert.equal(store.data.get("users/buyer/billing/account").package, "free");
assert.equal((await snapshot("buyer", now)).limit, 1);
assert.equal((await service.notify(await notification(order2.orderId, "settlement"))).action, "recorded");
assert.equal(store.data.get("users/buyer/billing/account").package, "free", "Pesanan yang sudah dicabut tidak menghidupkan Pro lagi");

// 9. Kedaluwarsa pesanan menggantung tidak mengubah hak akses, dan pembelian baru sesudah refund tetap sah.
const order3 = await buy();
assert.equal((await sendWebhook(await notification(order3.orderId, "expire"))).status, 200);
assert.equal(store.data.get(`orders/${order3.orderId}`).status, "failed");
assert.equal((await snapshot()).package, "free", "Kedaluwarsa tidak mengaktifkan Pro");
const deniedOrder = await buy();
assert.equal((await sendWebhook(await notification(deniedOrder.orderId, "deny"))).body.action, "failed");
assert.equal((await snapshot()).package, "free");

// 10. capture/challenge ditahan; capture/accept mengaktifkan.
const order4 = await buy();
await sendWebhook(await notification(order4.orderId, "capture", { fraud: "challenge" }));
assert.equal((await snapshot()).package, "free");
assert.equal((await sendWebhook(await notification(order4.orderId, "capture", { fraud: "accept" }))).body.action, "activated");
assert.equal((await snapshot()).package, "pro");

// 10b. Pembatalan transaksi yang sudah berhasil mencabut Pro; kiriman ulang tidak mengaktifkan lagi.
assert.equal((await sendWebhook(await notification(order4.orderId, "cancel"))).body.action, "revoked");
assert.equal((await snapshot()).package, "free");
assert.equal((await sendWebhook(await notification(order4.orderId, "settlement"))).body.status, "revoked");
assert.equal((await snapshot()).package, "free");

// 11. Tanpa Server Key: gagal tertutup 503, tombol tidak ditawarkan, tidak ada pesanan menggantung.
globalThis.runtimeEnv.MIDTRANS_SANDBOX_SERVER_KEY = "";
assert.equal(m.publicConfig().payments.ready, false);
assert.equal(m.publicConfig().payments.keyPresent, false);
assert.equal((await m.transaction(snapRequest())).status, 503);
assert.equal((await sendWebhook(await notification(order4.orderId, "settlement"))).status, 503);
globalThis.runtimeEnv.MIDTRANS_SANDBOX_SERVER_KEY = KEY;

// 11b. Mode Sandbox tidak pernah memakai key Production sebagai cadangan.
globalThis.runtimeEnv.MIDTRANS_SANDBOX_CLIENT_KEY = "Mid-client-wrong-environment";
assert.equal(m.publicConfig().payments.ready, false);
assert.equal((await m.transaction(snapRequest())).status, 503);
globalThis.runtimeEnv.MIDTRANS_SANDBOX_CLIENT_KEY = CLIENT_KEY;
globalThis.runtimeEnv.MIDTRANS_SANDBOX = "on";
assert.throws(() => m.runtimeValues(), /Invalid Midtrans environment/);
globalThis.runtimeEnv.MIDTRANS_SANDBOX = "1";

// 12. Harga tidak wajar gagal tertutup.
globalThis.runtimeEnv.MIDTRANS_PRO_PRICE = "0";
assert.throws(() => m.runtimeValues(), /Invalid Pro price/);
globalThis.runtimeEnv.MIDTRANS_PRO_PRICE = "49000";

// 13. Kunci ditolak Midtrans: pesanan tidak ditinggal menggantung sebagai pending.
snapFailure = "unauthorized";
const denied = await m.transaction(snapRequest());
assert.equal(denied.status, 503);
assert.equal((await denied.json()).code, "midtrans-key");
snapFailure = "offline";
assert.equal((await m.transaction(snapRequest("pembeli-lain"))).status, 503);
snapFailure = null;
const hanging = [...store.data.entries()].filter(([path, value]) => path.startsWith("orders/") && value.status === "pending");
assert.equal(hanging.length, 0, "Pesanan yang gagal Snap tidak boleh menggantung sebagai pending");

console.log("PASS: binding Sandbox/Production terpisah; harga & masa aktif server; penjaga origin/sesi; bentuk permintaan Snap; tanda tangan, merchant, jumlah, status_code dan fraud diverifikasi; pending/deny/expire ditahan; settlement hanya mengaktifkan sekali; perpanjangan dan read-only setelah 30 hari; cancel/refund mencabut Pro; kunci kosong atau salah lingkungan gagal tertutup; kegagalan Snap tidak menyisakan pesanan menggantung.");
