import { z } from "zod";
import { ServiceError, type RecordData, type TransactionalStore } from "./server-store";
import { ownerPath } from "./server-quota";

// Pembayaran Pro 30 hari lewat Midtrans Snap.
// Aturan yang tidak boleh dilonggarkan:
// 1. Snap hanya dibuat di server; Server Key tidak pernah sampai ke browser.
// 2. Notifikasi wajib lolos tanda tangan sha512(order_id + status_code + gross_amount + Server Key).
// 3. Jumlah yang dibayar harus sama dengan harga yang tercatat pada pesanan.
// 4. Hak Pro hanya diberikan setelah pembayaran terverifikasi, dan prosesnya idempoten.

export const DAY_MS = 86_400_000;
export const ORDER_HOURS = 24;
export const ORDER_PREFIX = "RN-";
export const ORDER_LIMIT = 6;
export const ORDER_WINDOW_MS = 600_000;
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const OWNER_TAG_PATTERN = /^[A-Za-z0-9]{1,24}$/;

export type MidtransConfig = { serverKey: string; clientKey: string; merchantId: string; testUid: string; sandbox: boolean; price: number; days: number; ready: boolean };
export type OrderStatus = "pending" | "paid" | "failed" | "revoked";
export type PaymentOutcome = "paid" | "pending" | "failed" | "revoked";

export const notificationSchema = z.object({
  order_id: z.string().min(1).max(64),
  status_code: z.union([z.string(), z.number()]).transform(value => String(value)).pipe(z.string().min(1).max(8)),
  gross_amount: z.union([z.string(), z.number()]).transform(value => String(value)).pipe(z.string().min(1).max(32)),
  transaction_status: z.string().min(1).max(32),
  signature_key: z.string().min(1).max(256),
  fraud_status: z.string().max(32).optional(),
  payment_type: z.string().max(40).optional(),
  transaction_id: z.string().max(64).optional(),
  merchant_id: z.string().min(1).max(64).optional(),
  status_message: z.string().max(200).optional(),
});
export type MidtransNotification = z.infer<typeof notificationSchema>;

function iso(ms: number) { return new Date(ms).toISOString(); }
export function orderPath(orderId: string) { return `orders/${orderId}`; }
export function snapBase(sandbox: boolean) { return sandbox ? "https://app.sandbox.midtrans.com" : "https://app.midtrans.com"; }
export function validOrderId(value: unknown): value is string { return typeof value === "string" && ORDER_ID_PATTERN.test(value); }

// Nama pesanan memuat penanda pemilik bila aman; catatan pesanan tetap menyimpan uid yang sebenarnya.
export function orderIdFor(uid: string, at: number, random: string) {
  const noise = random.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase() || "0";
  const tag = OWNER_TAG_PATTERN.test(uid) ? uid : noise;
  const orderId = `${ORDER_PREFIX}${tag}-${at.toString(36)}-${noise}`;
  if (!validOrderId(orderId)) throw new ServiceError(500, "order-id", "ID pesanan tidak dapat dibentuk.");
  return orderId;
}

export async function signature(serverKey: string, orderId: string, statusCode: string, grossAmount: string) {
  const bytes = new TextEncoder().encode(orderId + statusCode + grossAmount + serverKey);
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function sameSignature(expected: string, received: unknown) {
  if (typeof received !== "string" || received.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
}

// Status Midtrans -> akibat pada hak Pro. Status tak dikenal tidak pernah mengubah apa pun.
export function paymentOutcome(transactionStatus: string, fraudStatus?: string): PaymentOutcome {
  if (transactionStatus === "settlement") return "paid";
  if (transactionStatus === "capture") return fraudStatus === "challenge" ? "pending" : fraudStatus === "deny" ? "failed" : "paid";
  if (transactionStatus === "pending") return "pending";
  if (["deny", "expire", "failure"].includes(transactionStatus)) return "failed";
  if (["cancel", "refund", "chargeback"].includes(transactionStatus)) return "revoked";
  return "pending";
}

// Pembatas lokal per instance Worker: mencegah satu akun membanjiri dasbor Midtrans dengan pesanan menggantung.
const orderWindows = new Map<string, number[]>();

export function billingService(store: TransactionalStore, midtrans: MidtransConfig, clock = Date.now) {
  async function markFailed(orderId: string, reason: string) {
    await store.run(async tx => {
      const value = await tx.get(orderPath(orderId));
      if (value && value.status === "pending") tx.set(orderPath(orderId), { ...value, status: "failed", note: reason, updatedAt: iso(clock()) });
    });
  }
  return {
    async create(uid: string, origin: string) {
      if (!midtrans.ready) throw new ServiceError(503, "midtrans-config", "Kredensial pembayaran belum lengkap atau tidak sesuai lingkungan. Hubungi pengelola Rencanain.");
      if (midtrans.sandbox && midtrans.testUid && uid !== midtrans.testUid) throw new ServiceError(403, "sandbox-account", "Pembayaran uji hanya tersedia untuk akun penguji yang ditetapkan pengelola.");
      const now = clock(), recent = (orderWindows.get(uid) || []).filter(time => now - time < ORDER_WINDOW_MS);
      if (recent.length >= ORDER_LIMIT) throw new ServiceError(429, "order-limit", "Terlalu banyak permintaan pembayaran dalam sepuluh menit. Selesaikan pembayaran sebelumnya atau tunggu sebentar.");
      const orderId = orderIdFor(uid, now, crypto.randomUUID().replace(/-/g, "").slice(0, 6));
      const record: RecordData = { uid, amount: midtrans.price, days: midtrans.days, currency: "IDR", status: "pending", provider: "midtrans", merchantId: midtrans.merchantId, environment: midtrans.sandbox ? "sandbox" : "production", createdAt: iso(now), updatedAt: iso(now) };
      await store.run(async tx => { tx.set(orderPath(orderId), record); });
      orderWindows.set(uid, [...recent, now]);
      if (orderWindows.size > 1000) for (const [owner, times] of orderWindows) if (times.every(time => now - time >= ORDER_WINDOW_MS)) orderWindows.delete(owner);
      type SnapReply = { token?: string; redirect_url?: string; status_message?: string };
      let response: Response, body: SnapReply | null = null;
      try {
        response = await fetch(`${snapBase(midtrans.sandbox)}/snap/v1/transactions`, {
          method: "POST",
          headers: { Authorization: `Basic ${btoa(`${midtrans.serverKey}:`)}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            transaction_details: { order_id: orderId, gross_amount: midtrans.price },
            item_details: [{ id: `PRO-${midtrans.days}H`, price: midtrans.price, quantity: 1, name: `Rencanain Pro ${midtrans.days} hari` }],
            callbacks: { finish: `${origin}/pengaturan?bayar=selesai` },
            expiry: { unit: "hours", duration: ORDER_HOURS },
          }),
          signal: AbortSignal.timeout(15000),
        });
        body = await response.json() as SnapReply;
      } catch {
        await markFailed(orderId, "snap-network");
        throw new ServiceError(503, "midtrans-network", "Layanan pembayaran belum dapat dihubungi. Coba lagi beberapa saat; tidak ada pembayaran yang terpotong.");
      }
      const reply = body;
      if (!response.ok || !reply?.token || !reply?.redirect_url) {
        await markFailed(orderId, `snap-${response.status}`);
        // Sandbox/produksi tertukar atau kunci salah salin adalah sebab tersering di sini.
        if (response.status === 401 || response.status === 403) throw new ServiceError(503, "midtrans-key", "Kunci Midtrans ditolak layanan pembayaran. Pengelola perlu memeriksa Server Key pada environment yang benar. Tidak ada pembayaran yang terpotong.");
        throw new ServiceError(502, "midtrans-failed", "Layanan pembayaran belum dapat membuat transaksi. Coba lagi beberapa saat; tidak ada pembayaran yang terpotong.");
      }
      const redirectUrl = reply.redirect_url;
      const expiresAt = iso(now + ORDER_HOURS * 3_600_000);
      await store.run(async tx => { tx.set(orderPath(orderId), { ...record, providerToken: true, redirectUrl, expiresAt, updatedAt: iso(clock()) }); });
      return { orderId, amount: midtrans.price, days: midtrans.days, redirectUrl, expiresAt };
    },

    async notify(notification: MidtransNotification) {
      if (!midtrans.ready) throw new ServiceError(503, "midtrans-config", "Kredensial pembayaran belum lengkap atau tidak sesuai lingkungan.");
      if (!validOrderId(notification.order_id)) throw new ServiceError(400, "order-id", "Notifikasi pembayaran tidak dikenali.");
      const expected = await signature(midtrans.serverKey, notification.order_id, notification.status_code, notification.gross_amount);
      if (!sameSignature(expected, notification.signature_key)) throw new ServiceError(401, "signature", "Tanda tangan notifikasi pembayaran tidak sah.");
      if (notification.merchant_id && notification.merchant_id !== midtrans.merchantId) throw new ServiceError(403, "merchant-mismatch", "Merchant notifikasi pembayaran tidak sesuai.");
      const paid = Number(notification.gross_amount), outcome = paymentOutcome(notification.transaction_status, notification.fraud_status);
      return store.run(async tx => {
        const path = orderPath(notification.order_id), order = await tx.get(path);
        if (!order || typeof order.uid !== "string" || !Number.isFinite(order.amount as number)) throw new ServiceError(400, "order-unknown", "Pesanan ini tidak ada pada catatan Rencanain.");
        if (midtrans.sandbox && midtrans.testUid && order.uid !== midtrans.testUid) throw new ServiceError(403, "sandbox-account", "Pesanan Sandbox ini bukan milik akun penguji.");
        if (order.environment !== (midtrans.sandbox ? "sandbox" : "production") || order.merchantId !== midtrans.merchantId) throw new ServiceError(403, "merchant-mismatch", "Lingkungan atau merchant pesanan tidak sesuai.");
        if (!Number.isFinite(paid) || paid !== order.amount) throw new ServiceError(403, "amount-mismatch", "Jumlah pembayaran tidak sesuai harga paket. Hak Pro tidak diberikan.");
        if (outcome === "paid" && (notification.status_code !== "200" || (notification.fraud_status && notification.fraud_status !== "accept"))) throw new ServiceError(403, "payment-status", "Status keberhasilan pembayaran belum terverifikasi.");
        const now = clock(), uid = order.uid as string, previous = (typeof order.status === "string" ? order.status : "pending") as OrderStatus;
        const trace: RecordData = { updatedAt: iso(now), midtransStatus: notification.transaction_status, amount: order.amount };
        for (const [field, value] of [["paymentType", notification.payment_type], ["fraudStatus", notification.fraud_status], ["transactionId", notification.transaction_id]] as const) if (typeof value === "string" && value) trace[field] = value;
        const accountPath = `${ownerPath(uid)}/billing/account`;
        if (outcome === "paid") {
          if (previous === "paid") return { orderId: notification.order_id, action: "unchanged" as const, status: "paid" as const };
          if (previous === "revoked") { tx.set(path, { ...order, ...trace, status: "revoked", reviewNeeded: "notifikasi sukses setelah pencabutan" }); return { orderId: notification.order_id, action: "recorded" as const, status: "revoked" as const }; }
          const days = Number.isFinite(order.days as number) && (order.days as number) > 0 ? order.days as number : midtrans.days;
          const account = await tx.get(accountPath);
          const current = account && account.package === "pro" && typeof account.proExpiresAt === "string" ? Date.parse(account.proExpiresAt) : NaN;
          // Perpanjangan MENAMBAH dari tanggal berakhir yang masih berjalan, bukan menghitung ulang dari hari ini.
          const start = Number.isFinite(current) && current > now ? current : now;
          const expiresAt = iso(start + days * DAY_MS);
          tx.set(accountPath, {
            ...(account ?? {}), package: "pro", plan: `pro-${days}`, createdAt: typeof account?.createdAt === "string" ? account.createdAt : iso(now),
            proStartedAt: iso(now), proExpiresAt: expiresAt, proDays: days, updatedAt: iso(now),
            lastOrderId: notification.order_id, lastPayment: { orderId: notification.order_id, amount: order.amount, paidAt: iso(now), ...(typeof notification.payment_type === "string" ? { paymentType: notification.payment_type } : {}) },
          });
          tx.set(path, { ...order, ...trace, status: "paid", paidAt: iso(now) });
          return { orderId: notification.order_id, action: "activated" as const, status: "paid" as const, expiresAt };
        }
        if (outcome === "revoked") {
          if (previous !== "paid") { tx.set(path, { ...order, ...trace, status: "revoked", revokedAt: iso(now) }); return { orderId: notification.order_id, action: "recorded" as const, status: "revoked" as const }; }
          const account = await tx.get(accountPath);
          const ownsCurrent = !!account && (typeof account.lastOrderId !== "string" || account.lastOrderId === notification.order_id);
          if (account && account.package === "pro" && ownsCurrent) tx.set(accountPath, { ...account, package: "free", proStartedAt: null, proExpiresAt: null, updatedAt: iso(now), revokedOrderId: notification.order_id, revokedAt: iso(now) });
          else if (account && account.package === "pro") tx.set(accountPath, { ...account, updatedAt: iso(now), revokeReview: notification.order_id });
          tx.set(path, { ...order, ...trace, status: "revoked", revokedAt: iso(now), ...(ownsCurrent ? {} : { reviewNeeded: "pencabutan pesanan lama ditahan" }) });
          return { orderId: notification.order_id, action: "revoked" as const, status: "revoked" as const };
        }
        if (outcome === "failed" && previous === "pending") { tx.set(path, { ...order, ...trace, status: "failed" }); return { orderId: notification.order_id, action: "failed" as const, status: "failed" as const }; }
        tx.set(path, { ...order, ...trace, status: previous });
        return { orderId: notification.order_id, action: "recorded" as const, status: previous };
      });
    },
  };
}
