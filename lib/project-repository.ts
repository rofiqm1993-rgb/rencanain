"use client";
import { collection, getDocsFromServer } from "firebase/firestore";
import { firebaseDB, firebaseAuth, authHeaders } from "./firebase-client";
import { decodeProjectFromFirestore } from "./project-firestore-codec";
import { requestJSON } from "./client-request";
import { projectSchema, type Project, type GeneratedPlan } from "./prd";
import { readWithTimeout, requireConnection, UserFacingError } from "./user-errors";
const key = "aipp-projects";
const saves = new Map<string, Promise<Project>>();
async function serverWrite(uid: string, method: string, body: unknown) {
  const user = firebaseAuth().currentUser;
  if (!user || user.uid !== uid) throw new UserFacingError("session", "Sesi akun berubah. Masuk kembali sebelum menyimpan.");
  const headers = await readWithTimeout(authHeaders(user), 15000);
  return requestJSON<unknown>("/api/projects", { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }, 60000);
}
function parseProject(value: unknown): Project {
  const parsed = projectSchema.safeParse(value);
  if (!parsed.success) throw new UserFacingError("project-data", "Ada proyek dengan format yang belum dapat dibaca. Data tidak dihapus. Muat ulang; jika tetap gagal, hubungi pengelola untuk memulihkan proyek.");
  return parsed.data;
}
function localProjects(): Project[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  let values: unknown;
  try { values = JSON.parse(raw); } catch { throw new UserFacingError("local-data", "Data proyek di browser belum dapat dibaca. Jangan hapus data situs; ekspor PRD yang masih terbuka dan hubungi pengelola untuk pemulihan."); }
  if (!Array.isArray(values)) throw new UserFacingError("local-data", "Data proyek lokal belum dapat dibaca. Jangan hapus data situs; ekspor PRD yang masih terbuka terlebih dahulu.");
  return values.map(parseProject);
}
export const projectRepository = {
  async list(uid: string | null): Promise<Project[]> {
    if (!uid) return localProjects().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    requireConnection();
    const result = await readWithTimeout(getDocsFromServer(collection(firebaseDB(), "users", uid, "projects")));
    return result.docs.map(d => parseProject(decodeProjectFromFirestore({ ...d.data(), id: d.id }))).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  async save(plan: GeneratedPlan, uid: string | null): Promise<Project> {
    const saveKey = JSON.stringify([uid, plan]);
    const existing = saves.get(saveKey);
    if (existing) return existing;
    if (uid) requireConnection();
    const operation = (async () => {
      const project = parseProject({ ...plan, id: crypto.randomUUID(), savedAt: new Date().toISOString(), tasks: {} });
      if (uid) return parseProject(await serverWrite(uid, "POST", plan));
      else localStorage.setItem(key, JSON.stringify([project, ...localProjects()]));
      return project;
    })();
    saves.set(saveKey, operation);
    try { return await operation; } catch (error) { saves.delete(saveKey); throw error; }
    finally { if (uid) saves.delete(saveKey); }
  },
  async remove(id: string, uid: string | null) {
    if (uid) requireConnection();
    if (uid) await serverWrite(uid, "DELETE", { id });
    else localStorage.setItem(key, JSON.stringify(localProjects().filter(p => p.id !== id)));
  },
  async setTask(project: Project, taskId: string, done: boolean, uid: string | null): Promise<Project> {
    if (uid) requireConnection();
    const tasks = { ...project.tasks }; if (done) tasks[taskId] = true; else delete tasks[taskId];
    if (uid) return parseProject(await serverWrite(uid, "PATCH", { id: project.id, taskId, done }));
    else localStorage.setItem(key, JSON.stringify(localProjects().map(p => p.id === project.id ? { ...p, tasks } : p)));
    return { ...project, tasks };
  },
};
