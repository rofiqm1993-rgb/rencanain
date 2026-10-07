import { runtimeValues } from "@/lib/server-runtime";
import { createFirestoreStore, ServiceError } from "@/lib/server-store";
import { requestOwner, apiResult, apiError } from "@/lib/server-request";
import { billingService } from "@/lib/server-billing";
// Membuat transaksi Snap untuk akun yang sedang masuk. Harga dan masa aktif ditentukan server.
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const config = runtimeValues();
    if (!config.midtrans.ready) throw new ServiceError(503, "midtrans-config", "Pembayaran Pro belum disiapkan pengelola: kredensial Midtrans belum lengkap atau tidak sesuai lingkungan.");
    const uid = await requestOwner(request, true);
    return apiResult(await billingService(createFirestoreStore(), config.midtrans).create(uid, new URL(request.url).origin));
  } catch (error) {
    if (error instanceof SyntaxError) return apiError(new ServiceError(400, "input", "Format permintaan pembayaran tidak valid."));
    return apiError(error);
  }
}
