import { runtimeValues } from "@/lib/server-runtime";
import { createFirestoreStore, ServiceError } from "@/lib/server-store";
import { requestBody, apiResult, apiError } from "@/lib/server-request";
import { billingService, notificationSchema } from "@/lib/server-billing";
// Endpoint tak terautentikasi: Midtrans yang memanggil. Keamanannya bertumpu pada tanda tangan sha512,
// pemeriksaan jumlah, dan catatan pesanan di Firestore — bukan pada header mana pun dari pemanggil.
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const config = runtimeValues();
    if (!config.midtrans.ready) throw new ServiceError(503, "midtrans-config", "Kredensial Midtrans belum lengkap atau tidak sesuai lingkungan.");
    const parsed = notificationSchema.safeParse(await requestBody(request, 20000));
    if (!parsed.success) throw new ServiceError(400, "notification", "Notifikasi pembayaran tidak dikenali.");
    const result = await billingService(createFirestoreStore(), config.midtrans).notify(parsed.data);
    return apiResult({ received: true, ...result });
  } catch (error) { return apiError(error); }
}
