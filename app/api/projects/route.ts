import { runtimeValues } from "@/lib/server-runtime";
import { createFirestoreStore, ServiceError } from "@/lib/server-store";
import { projectService } from "@/lib/server-projects";
import { requestOwner, requestBody, apiResult, apiError } from "@/lib/server-request";
import { z } from "zod";
export const dynamic = "force-dynamic";
const updateSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/), taskId: z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/), done: z.boolean() });
const detailsSchema = z.object({ id: updateSchema.shape.id, title: z.string().trim().min(1).max(160), summary: z.string().trim().min(1).max(3000) });
export async function POST(request: Request) {
  try { const uid = await requestOwner(request, true); return apiResult(await projectService(createFirestoreStore(), runtimeValues().quotaPolicy).save(uid, await requestBody(request))); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const uid = await requestOwner(request, true), input = updateSchema.safeParse(await requestBody(request, 2000));
    if (!input.success) throw new ServiceError(400, "task-data", "Perubahan tugas tidak valid.");
    return apiResult(await projectService(createFirestoreStore(), runtimeValues().quotaPolicy).task(uid, input.data.id, input.data.taskId, input.data.done));
  } catch (error) { return apiError(error); }
}
export async function PUT(request: Request) {
  try {
    const uid = await requestOwner(request, true), input = detailsSchema.safeParse(await requestBody(request, 8000));
    if (!input.success) throw new ServiceError(400, "project-details", "Judul atau ringkasan proyek tidak valid.");
    const { id, title, summary } = input.data;
    return apiResult(await projectService(createFirestoreStore(), runtimeValues().quotaPolicy).updateDetails(uid, id, title, summary));
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try {
    const uid = await requestOwner(request, true), input = updateSchema.pick({ id: true }).safeParse(await requestBody(request, 2000));
    if (!input.success) throw new ServiceError(400, "project-id", "ID proyek tidak valid.");
    await projectService(createFirestoreStore(), runtimeValues().quotaPolicy).remove(uid, input.data.id);
    return apiResult({ removed: true });
  } catch (error) { return apiError(error); }
}
