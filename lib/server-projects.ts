import { generatedPlanSchema, projectSchema, taskList, type GeneratedPlan, type Project } from "./prd";
import { decodeProjectFromFirestore, encodeProjectForFirestore } from "./project-firestore-codec";
import { entitlement, fingerprint, ownerPath, requireWritable, validRequestId, type QuotaPolicy } from "./server-quota";
import { ServiceError, type TransactionalStore } from "./server-store";
export function projectService(store: TransactionalStore, policy: QuotaPolicy, clock = Date.now) {
  return {
    async save(uid: string, input: unknown): Promise<Project> {
      const parsed = generatedPlanSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError(400, "project-data", "Struktur proyek tidak valid.");
      const supplied = parsed.data;
      const id = supplied.source === "ai" && supplied.generationId ? `ai-${supplied.generationId}` : `example-${await fingerprint(supplied)}`;
      return store.run(async tx => {
        const root = ownerPath(uid), path = `${root}/projects/${id}`, existing = await tx.get(path);
        if (existing) return projectSchema.parse(decodeProjectFromFirestore(existing));
        const a = await entitlement(tx, uid, clock(), policy); requireWritable(a);
        let plan: GeneratedPlan = supplied;
        if (plan.source === "ai") {
          if (!validRequestId(plan.generationId)) throw new ServiceError(400, "generation-receipt", "PRD AI ini belum memiliki konfirmasi server. Ekspor hasil lama atau susun kembali untuk menyimpan ke akun.");
          const job = await tx.get(`${root}/generations/${plan.generationId}`);
          if (job?.status !== "completed") throw new ServiceError(409, "generation-receipt", "Hasil AI belum dikonfirmasi oleh server. Coba kembali mengambil hasilnya.");
          plan = generatedPlanSchema.parse(decodeProjectFromFirestore(job.result));
        }
        const project = projectSchema.parse({ ...plan, id, savedAt: new Date(clock()).toISOString(), tasks: {} });
        tx.set(path, encodeProjectForFirestore(project));
        return project;
      });
    },
    async task(uid: string, id: string, taskId: string, done: boolean): Promise<Project> {
      return store.run(async tx => {
        const path = `${ownerPath(uid)}/projects/${id}`;
        requireWritable(await entitlement(tx, uid, clock(), policy));
        const value = await tx.get(path);
        if (!value) throw new ServiceError(404, "project-missing", "Proyek belum ditemukan di akun ini.");
        const project = projectSchema.parse(decodeProjectFromFirestore(value));
        if (!taskList(project.prd).some(t => t.id === taskId)) throw new ServiceError(400, "task-id", "Tugas tidak ditemukan dalam proyek.");
        if (done) project.tasks[taskId] = true; else delete project.tasks[taskId];
        tx.set(path, encodeProjectForFirestore(project));
        return project;
      });
    },
    async updateDetails(uid: string, id: string, title: string, summary: string): Promise<Project> {
      return store.run(async tx => {
        const path = `${ownerPath(uid)}/projects/${id}`;
        requireWritable(await entitlement(tx, uid, clock(), policy));
        const value = await tx.get(path);
        if (!value) throw new ServiceError(404, "project-missing", "Proyek belum ditemukan di akun ini.");
        const project = projectSchema.parse(decodeProjectFromFirestore(value));
        const updated = projectSchema.parse({ ...project, prd: { ...project.prd, title, summary } });
        tx.set(path, encodeProjectForFirestore(updated));
        return updated;
      });
    },
    async remove(uid: string, id: string) {
      await store.run(async tx => {
        requireWritable(await entitlement(tx, uid, clock(), policy));
        const path = `${ownerPath(uid)}/projects/${id}`;
        if (!await tx.get(path)) throw new ServiceError(404, "project-missing", "Proyek belum ditemukan di akun ini.");
        tx.delete(path);
      });
    },
  };
}
