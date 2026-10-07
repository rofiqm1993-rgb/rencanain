import { runtimeValues } from "@/lib/server-runtime";
import { createFirestoreStore } from "@/lib/server-store";
import { quotaService } from "@/lib/server-quota";
import { requestOwner, apiResult, apiError } from "@/lib/server-request";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const uid = await requestOwner(request); return apiResult(await quotaService(createFirestoreStore(), runtimeValues().quotaPolicy).snapshot(uid)); }
  catch (error) { return apiError(error); }
}
