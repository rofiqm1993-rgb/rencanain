"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import FeedbackNotice from "./feedback-notice";
import VisualMotion from "./visual-motion";
import EntryGuide, { ExamplePreview } from "./entry-guide";
import ProductShowcase from "./product-showcase";
import { requestJSON } from "@/lib/client-request";
import { userError, withPendingNotice } from "@/lib/user-errors";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { LayoutDashboard, FolderOpen, ListTodo, Settings, LogOut, Files, Layers, CheckCheck, NotebookPen, ArrowUpRight, ArrowRight, PenLine } from "lucide-react";
import ClarificationWizard from "./clarification-wizard";
import TechStackSelector from "./tech-stack-selector";
import PRDGenerator from "./prd-generator";
import PlanView from "./plan-view";
import LoginPanel from "./login-panel";
import { newDraft, readDraft, type ClarificationDraft } from "@/lib/clarification";
import { draftFingerprint, recommendStack, isTechStack, stackConflicts, type TechStack } from "@/lib/tech-stack";
import { authHeaders, configureFirebase, firebaseAuth, type ClientConfig } from "@/lib/firebase-client";
import type { AccountSnapshot } from "@/lib/account";
import AccountStatus from "./account-status";
import ProUpgrade from "./pro-upgrade";
import ProjectActions from "./project-actions";
import { generatedPlanSchema, taskList, type GeneratedPlan, type Project } from "@/lib/prd";
import { projectRepository } from "@/lib/project-repository";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

function Brand() { return <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>rencanain<span className="muted">.</span></div>; }
const nav = [{ label: "Ringkasan", icon: LayoutDashboard, path: "/" }, { label: "Proyek", icon: FolderOpen, path: "/proyek" }, { label: "Tugas", icon: ListTodo, path: "/tugas" }, { label: "Pengaturan", icon: Settings, path: "/pengaturan" }];
function WorkspaceNavigation({ pathname, count, onNavigate }: { pathname: string; count: number; onNavigate: (path: string) => void }) {
  const { setOpenMobile } = useSidebar();
  return <SidebarMenu className="nav-menu">{nav.map(({ label, icon: Icon, path }) => <SidebarMenuItem key={path}><SidebarMenuButton isActive={path === "/" ? pathname === "/" : pathname.startsWith(path)} onClick={() => { setOpenMobile(false); onNavigate(path); }}><Icon /><span>{label}</span>{path === "/proyek" && <span className="nav-count">{count}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>;
}
export default function RencanainApp() {
  const router = useRouter(), pathname = usePathname();
  const [ready, setReady] = useState(false), [demo, setDemo] = useState(false), [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<ClientConfig>({ firebase: null, aiReady: false, model: "" });
  const [idea, setIdea] = useState(""), [draft, setDraft] = useState<ClarificationDraft | null>(null), [stack, setStack] = useState<TechStack | null>(null), [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [error, setError] = useState(""), [projects, setProjects] = useState<Project[]>([]), [loadingProjects, setLoadingProjects] = useState(false), [active, setActive] = useState(""), [taskBusy, setTaskBusy] = useState(false), [projectBusy, setProjectBusy] = useState(false), [filter, setFilter] = useState("all");
  const [projectError, setProjectError] = useState(""), [reloadProjects, setReloadProjects] = useState(0), [offline, setOffline] = useState(false), [pendingTask, setPendingTask] = useState("");
  const [accountState, setAccountState] = useState<{ uid: string; value: AccountSnapshot } | null>(null), [accountFailure, setAccountFailure] = useState<{ uid: string; message: string } | null>(null), [accountReload, setAccountReload] = useState(0);
  const mounted = useRef(true), loadedOwner = useRef<string | null | undefined>(undefined), taskLock = useRef(false), taskSequence = useRef(0), projectRevision = useRef(0), currentSession = useRef<string | null>(null), currentPath = useRef(pathname), paymentReturn = useRef(false);

  const authenticated = demo || !!user, uid = user?.uid || null;
  const account = accountState?.uid === uid ? accountState.value : null;
  const accountError = accountFailure?.uid === uid ? accountFailure.message : "";
  const writeBlocked = !!user && (!account || account.readOnly || !!accountError);
  const isWizard = pathname === "/proyek/wizard", isStack = pathname === "/proyek/tech-stack", isGenerator = pathname === "/proyek/prd";
  const selected = projects.find(p => p.id === active);
  useEffect(() => { currentSession.current = uid; currentPath.current = pathname; }, [uid, pathname]);
  useEffect(() => {
    taskSequence.current += 1;
    taskLock.current = false;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setTaskBusy(false); setPendingTask(""); setError(""); } });
    return () => { cancelled = true; };
  }, [uid]);
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => { if (mounted.current) setOffline(!navigator.onLine); });
    const disconnected = () => { setOffline(true); toast.warning("Koneksi internet terputus. Draft lokal tetap tersedia; perubahan akun memerlukan koneksi."); };
    const connected = () => { setOffline(false); toast.info("Koneksi kembali tersedia. Coba lagi tindakan yang gagal; penyimpanan yang masih menunggu akan dilanjutkan."); };
    window.addEventListener("offline", disconnected); window.addEventListener("online", connected);
    return () => { mounted.current = false; window.removeEventListener("offline", disconnected); window.removeEventListener("online", connected); };
  }, []);
  useEffect(() => {
    let cancelled = false, unsubscribe = () => {};
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setDemo(localStorage.getItem("aipp-demo-session") === "true"); setIdea(localStorage.getItem("aipp-idea") || "");
        const savedDraft = readDraft(localStorage.getItem("aipp-draft")); setDraft(savedDraft); setActive(localStorage.getItem("aipp-active-project") || "");
        if (savedDraft) {
          const fingerprint = draftFingerprint(savedDraft);
          const savedStack = JSON.parse(localStorage.getItem("aipp-stack") || "null");
          const chosen = savedStack?.fingerprint === fingerprint && isTechStack(savedStack.stack) ? savedStack.stack : recommendStack(savedDraft).stack;
          setStack(chosen);
          const savedPlan = JSON.parse(localStorage.getItem("aipp-generated-prd") || "null");
          const parsedPlan = generatedPlanSchema.safeParse(savedPlan);
          if (parsedPlan.success && draftFingerprint(parsedPlan.data.draft) === fingerprint && JSON.stringify(parsedPlan.data.stack) === JSON.stringify(chosen)) setPlan(parsedPlan.data);
        }
        if (localStorage.getItem("aipp-theme") === "light") document.documentElement.classList.remove("dark");
      } catch { setError("Sebagian data lokal belum dapat dibaca. Muat ulang atau periksa penyimpanan browser."); }
      void requestJSON<ClientConfig>("/api/config", {}, 15000).then(value => {
        if (cancelled) return; setConfig(value);
        if (!value.firebase) { setReady(true); return; }
        unsubscribe = onAuthStateChanged(configureFirebase(value.firebase), account => { if (!cancelled) { setUser(account); setReady(true); } }, () => { if (!cancelled) { setError("Sesi Firebase belum dapat dibaca. Coba mode demo atau muat ulang."); setReady(true); } });
      }).catch(e => { if (!cancelled) { setError(userError(e, "config")); setReady(true); } });
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingProjects(true); setProjectError("");
      if (loadedOwner.current !== uid) { setProjects([]); loadedOwner.current = uid; }
      const revision = projectRevision.current;
      void projectRepository.list(uid).then(value => { if (!cancelled && revision === projectRevision.current) setProjects(value); }).catch(e => { if (!cancelled) { const message = userError(e, "load"); setProjectError(message); toast.error(message); } }).finally(() => { if (!cancelled) setLoadingProjects(false); });
    });
    return () => { cancelled = true; };
  }, [ready, authenticated, uid, reloadProjects]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false, inFlight = false;
    const load = async () => {
      if (inFlight) return; inFlight = true;
      try {
        const headers = await authHeaders(user);
        const value = await requestJSON<AccountSnapshot>("/api/account", { headers }, 30000);
        if (!cancelled) { setAccountState({ uid: user.uid, value }); setAccountFailure(null); }
      } catch (e) { if (!cancelled) setAccountFailure({ uid: user.uid, message: userError(e, "load") }); }
      finally { inFlight = false; }
    };
    void load();
    const interval = setInterval(() => void load(), 60000);
    window.addEventListener("focus", load); window.addEventListener("online", load);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener("focus", load); window.removeEventListener("online", load); };
  }, [user, accountReload]);
  useEffect(() => {
    // Kembali dari halaman pembayaran Midtrans: periksa status paket sekali, tanpa menunggu interval.
    if (!user || paymentReturn.current) return;
    if (!new URLSearchParams(window.location.search).has("bayar")) return;
    paymentReturn.current = true;
    // Ditunda satu microtask agar tidak memicu render berantai di dalam effect (pola yang sama dipakai effect lain di berkas ini).
    queueMicrotask(() => {
      setAccountReload(value => value + 1);
      toast.info("Memeriksa status pembayaran. Bila Pro belum aktif, beri jeda beberapa detik lalu tekan Periksa status pembayaran.");
    });
  }, [user]);
  useEffect(() => {
    if (!account?.expiresAt || account.readOnly) return;
    const delay = Date.parse(account.expiresAt) - Date.now();
    const timer = setTimeout(() => {
      if (delay > 2147483647) setAccountReload(n => n + 1);
      else setAccountState(state => state?.uid === uid ? { ...state, value: { ...state.value, status: "expired", readOnly: true, remaining: 0 } } : state);
    }, Math.max(0, Math.min(delay, 2147483647)));
    return () => clearTimeout(timer);
  }, [account, uid]);
  useEffect(() => {
    if (!ready || !authenticated) return;
    if ((isWizard || isStack || isGenerator) && !draft) router.replace("/");
    else if ((isStack || isGenerator) && !draft?.completed) router.replace("/proyek/wizard");
    else if (isGenerator && stack && draft && stackConflicts(stack, draft).length) router.replace("/proyek/tech-stack");
  }, [ready, authenticated, isWizard, isStack, isGenerator, draft, stack, router]);
  function persist(key: string, value: string) { try { localStorage.setItem(key, value); return true; } catch (e) { const message = userError(e, "save"); setError(message); toast.error(message, { id: "local-storage" }); return false; } }
  function saveDraft(value: ClarificationDraft) {
    if (!persist("aipp-draft", JSON.stringify(value))) return;
    if (!draft || draftFingerprint(value) !== draftFingerprint(draft)) { setStack(recommendStack(value).stack); setPlan(null); }
    setDraft(value);
  }
  function clarify() { if (writeBlocked || idea.trim().length < 20) return; const value = draft?.idea === idea.trim() ? draft : newDraft(idea.trim()); if (!persist("aipp-draft", JSON.stringify(value))) return; setDraft(value); if (!stack || draft?.idea !== value.idea) { setStack(recommendStack(value).stack); setPlan(null); } router.push("/proyek/wizard"); }
  function saveStack(value: TechStack) { if (!draft || !persist("aipp-stack", JSON.stringify({ fingerprint: draftFingerprint(draft), stack: value }))) return; setStack(value); setPlan(null); }
  function savePlan(value: GeneratedPlan) { setPlan(value); persist("aipp-generated-prd", JSON.stringify(value)); }
  function openProject(id: string) { setActive(id); persist("aipp-active-project", id); router.push("/proyek"); }
  async function saveProject(value: GeneratedPlan) {
    const project = await projectRepository.save(value, uid);
    if (!mounted.current || currentSession.current !== uid) return;
    projectRevision.current += 1;
    setProjects(old => [project, ...old.filter(p => p.id !== project.id)]);
    toast.success(uid ? "Proyek berhasil tersimpan di akun Anda." : "Proyek berhasil tersimpan di browser ini.");
    if (currentPath.current === "/proyek/prd") openProject(project.id);
  }
  async function updateProject(project: Project, title: string, summary: string) {
    if (writeBlocked || taskLock.current) throw new Error("Perubahan proyek belum tersedia saat ini.");
    setProjectBusy(true);
    try {
      const updated = await projectRepository.updateDetails(project, title, summary, uid);
      if (!mounted.current || currentSession.current !== uid) return;
      projectRevision.current += 1;
      setProjects(old => old.map(item => item.id === updated.id ? updated : item));
      toast.success("Detail proyek berhasil diperbarui.");
    } finally { if (mounted.current) setProjectBusy(false); }
  }
  async function removeProject(project: Project) {
    if (writeBlocked || taskLock.current) throw new Error("Penghapusan proyek belum tersedia saat ini.");
    setProjectBusy(true);
    try {
      await projectRepository.remove(project.id, uid);
      if (!mounted.current || currentSession.current !== uid) return;
      projectRevision.current += 1;
      setProjects(old => old.filter(item => item.id !== project.id));
      setActive(""); persist("aipp-active-project", "");
      toast.success("Proyek berhasil dihapus.");
    } finally { if (mounted.current) setProjectBusy(false); }
  }
  async function changeTask(project: Project, id: string, done: boolean) {
    if (taskLock.current || projectBusy) return; taskLock.current = true; setTaskBusy(true); setError(""); setPendingTask("");
    const sequence = taskSequence.current;
    try {
      const updated = await withPendingNotice(projectRepository.setTask(project, id, done, uid), () => { if (mounted.current && currentSession.current === uid) { const message = "Perubahan checklist masih menunggu konfirmasi penyimpanan. Periksa internet dan biarkan halaman terbuka; status sebelumnya tetap tampil sampai berhasil."; setPendingTask(message); toast.warning(message); } });
      if (mounted.current && currentSession.current === uid) { projectRevision.current += 1; setProjects(old => old.map(p => p.id === updated.id ? updated : p)); toast.success("Perubahan checklist tersimpan."); }
    } catch (e) { if (mounted.current && currentSession.current === uid) { const message = userError(e, "task"); setError(message); toast.error(message); } }
    finally { if (sequence === taskSequence.current) { taskLock.current = false; if (mounted.current) { setTaskBusy(false); setPendingTask(""); } } }
  }
  async function logout() { try { if (user) await signOut(firebaseAuth()); localStorage.removeItem("aipp-demo-session"); setDemo(false); setProjects([]); } catch { setError("Belum berhasil keluar. Coba lagi."); } }
  function projectCards(values: Project[]) { return loadingProjects && !values.length ? <p className="muted" role="status">Memuat proyek…</p> : values.length ? <div className="project-list" aria-busy={loadingProjects}>{values.map(p => { const all = taskList(p.prd), done = all.filter(t => p.tasks[t.id]).length; return <button className="project-card" key={p.id} onClick={() => openProject(p.id)}><span className="eyebrow">{p.source === "ai" ? "Disusun dengan DeepSeek" : "Contoh lokal"}</span><h3>{p.prd.title}</h3><p>{p.prd.summary}</p><small>{p.prd.phases.length} fase · {done}/{all.length} tugas selesai</small></button>; })}</div> : projectError ? null : <div className="empty-state"><NotebookPen size={22} /><div><h3>Rencana pertama Anda mulai di sini.</h3><p>Proyek yang disimpan akan muncul beserta progres tugasnya.</p></div></div>; }
  if (!ready) return <div className="login-page"><Brand /><p className="muted">Membuka ruang kerja…</p></div>;
  if (!authenticated) return <VisualMotion entry routeKey="entry" className="login-page"><nav className="login-top" aria-label="Navigasi halaman masuk"><Brand /><div className="entry-nav-actions"><a className="entry-nav-link" href="#cara-kerja">Cara kerja</a><a className="entry-nav-login" href="#masuk">Masuk <ArrowUpRight size={15} /></a></div></nav><main className="entry-main"><section className="entry-hero"><h1>Ubah Ide Aplikasi Menjadi <span>Dokumen PRD &amp; Alur Tugas Siap Pakai</span> dalam 2 Menit</h1><p>Jawab kuesioner interaktif untuk memperjelas kebutuhan, lalu biarkan AI menyusun PRD dan tugasnya. Hemat waktu tanpa menyusun dokumen manual dari halaman kosong.</p><div className="entry-hero-actions"><a className="entry-cta" href="#masuk">Coba Gratis <ArrowUpRight size={18} /></a><a className="entry-secondary-cta" href="#cara-kerja">Lihat cara kerja <ArrowRight size={18} /></a></div><ProductShowcase /></section><EntryGuide /><div className="login-grid"><section className="login-story"><div className="preview-heading"><h2>Rencananya mulai terbentuk.</h2><p>Dokumen, fase, dan tugas berada dalam satu alur. Berikut contoh strukturnya.</p></div><ExamplePreview /></section><div id="masuk"><LoginPanel configured={!!config.firebase} onDemo={() => { if (persist("aipp-demo-session", "true")) setDemo(true); }} /></div></div><div className="entry-action"><h2>Sudah punya ide?<br /><span>Beri bentuk pada rencananya.</span></h2><a className="entry-cta" href="#masuk">Mulai di Rencanain <ArrowUpRight size={18} /></a></div></main>{error && <FeedbackNotice message={error} />}<footer className="login-footer"><Brand /><span>Dari ide ke rencana kerja.</span><a href="#masuk">Masuk / coba demo <ArrowUpRight size={14} /></a></footer></VisualMotion>;
  const totals = [projects.length, projects.reduce((n, p) => n + p.prd.phases.length, 0), projects.reduce((n, p) => n + taskList(p.prd).length, 0), projects.reduce((n, p) => n + taskList(p.prd).filter(t => p.tasks[t.id]).length, 0)];
  const title = isWizard ? "Perjelas ide" : isStack ? "Tech stack" : isGenerator ? "Generator PRD" : nav.find(n => n.path === pathname)?.label || "Proyek";
  return <SidebarProvider style={{ "--sidebar-width": "244px" } as CSSProperties}><a href="#main" className="skip-link">Lewati ke konten</a><Sidebar className="app-sidebar"><SidebarHeader className="sidebar-brand"><Brand /></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupLabel className="sidebar-group-label">Ruang kerja</SidebarGroupLabel><WorkspaceNavigation pathname={pathname} count={projects.length} onNavigate={path => { if (path === "/proyek" && pathname === path) { setActive(""); persist("aipp-active-project", ""); } else router.push(path); }} /></SidebarGroup><div className="sidebar-note"><span className="sidebar-note-icon"><NotebookPen size={18} /></span><strong>Satu ide, satu langkah.</strong><p>Mulai kecil. Tinjau rencananya, lalu kerjakan yang paling penting.</p></div></SidebarContent><SidebarFooter><div className="sidebar-footer-content"><div className="user-line"><div className="user-avatar">{user ? (user.displayName || user.email || "A")[0].toUpperCase() : "D"}</div><div className="user-name">{user?.displayName || user?.email || "Ruang demo"}<small>{user ? "Tersimpan di akun" : "Tersimpan di browser ini"}</small></div><Button variant="ghost" size="icon" aria-label="Keluar" onClick={() => void logout()}><LogOut size={15} /></Button></div></div></SidebarFooter></Sidebar><SidebarInset className="app-inset"><header className="app-topbar"><div className="breadcrumb"><SidebarTrigger className="mobile-trigger" /><span>Ruang kerja</span><span>/</span><strong>{title}</strong></div><div className="topbar-end">{user ? <AccountStatus account={account} /> : <span className="status-tag">Mode demo</span>}<span className="muted">Rencanain v.01</span></div></header><VisualMotion className="content" id="main" routeKey={`${pathname}:${active}`}>{offline && <FeedbackNotice warning message="Anda sedang offline. Draft lokal dapat diedit dan PRD dapat diekspor. Sambungkan internet untuk memakai AI atau menyimpan perubahan akun." />}{projectError && <FeedbackNotice message={projectError} onRetry={!loadingProjects ? () => setReloadProjects(value => value + 1) : undefined} />}{pendingTask && <FeedbackNotice message={pendingTask} warning />}{error && <FeedbackNotice message={error} />}
    {accountError && <FeedbackNotice message={accountError} onRetry={() => setAccountReload(n => n + 1)} />}
    {isWizard && draft && <ClarificationWizard draft={draft} onChange={saveDraft} onExit={() => router.push("/")} onContinue={() => { if (stack) saveStack(stack); router.push("/proyek/tech-stack"); }} />}
    {isStack && draft?.completed && stack && <TechStackSelector draft={draft} stack={stack} onChange={saveStack} onBack={() => router.push("/proyek/wizard")} onContinue={() => { if (persist("aipp-stack", JSON.stringify({ fingerprint: draftFingerprint(draft), stack }))) router.push("/proyek/prd"); }} />}
    {isGenerator && draft?.completed && stack && <PRDGenerator draft={draft} stack={stack} user={user} aiReady={config.aiReady} model={config.model} plan={plan} onPlan={savePlan} onBack={() => router.push("/proyek/tech-stack")} onSave={saveProject} account={account} writeBlocked={writeBlocked} onAccountRefresh={() => setAccountReload(n => n + 1)} />}
    {pathname === "/proyek" && <><div className="page-heading"><div className="page-heading-row"><div className="page-heading-title"><span className="workspace-caption">Proyek tersimpan</span><h1>{selected ? selected.prd.title : "Rencana Anda."}</h1></div><div className="page-heading-actions"><Button variant="outline" disabled={writeBlocked} onClick={() => { setActive(""); router.push("/"); }}>Ide baru</Button></div></div></div>{selected ? <><div className="project-toolbar"><Button variant="ghost" onClick={() => { setActive(""); persist("aipp-active-project", ""); }}>Semua proyek</Button><ProjectActions key={selected.id} project={selected} disabled={writeBlocked || taskBusy || projectBusy} onUpdate={(title, summary) => updateProject(selected, title, summary)} onDelete={() => removeProject(selected)} /></div><PlanView plan={selected} hideTitle tasks={selected.tasks} onTask={taskBusy || projectBusy || writeBlocked ? undefined : (id, done) => void changeTask(selected, id, done)} /></> : projectCards(projects)}</>}
    {pathname === "/tugas" && <><div className="page-heading"><div className="page-heading-row"><div className="page-heading-title"><span className="workspace-caption">Checklist proyek</span><h1>Kerjakan satu per satu.</h1><p>Tugas berasal dari PRD yang disimpan.</p></div></div></div><div className="page-toolbar"><span className="field-label">Filter tugas</span><Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filter tugas"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua tugas</SelectItem><SelectItem value="todo">Belum selesai</SelectItem><SelectItem value="done">Selesai</SelectItem></SelectContent></Select></div>{projects.length ? projects.map(p => <section className="plan-card" key={p.id}><h2>{p.prd.title}</h2>{taskList(p.prd).filter(t => filter === "all" || (filter === "done" ? !!p.tasks[t.id] : !p.tasks[t.id])).map(t => <label className="task-row" key={t.id}><Checkbox checked={!!p.tasks[t.id]} disabled={taskBusy || writeBlocked} onCheckedChange={value => void changeTask(p, t.id, value === true)} /><span>{t.title}<small>{t.phase} · {t.feature}</small></span></label>)}</section>) : projectCards([])}</>}
    {pathname === "/pengaturan" && <section className="clarification-panel"><div className="workspace-caption">Pengaturan</div><h1>Ruang kerja Anda.</h1><div className="plan-card"><h2>Status akun</h2>{user ? <AccountStatus account={account} variant="card" /> : <p className="help-note">Mode demo: status paket hanya berlaku untuk akun yang masuk.</p>}</div><div className="plan-card"><h2>Paket</h2><ProUpgrade payments={config.payments} user={user} account={account} onRefresh={() => setAccountReload(n => n + 1)} /></div>
<div className="plan-card"><h2>Tampilan</h2><Button variant="outline" onClick={() => { const dark = document.documentElement.classList.toggle("dark"); persist("aipp-theme", dark ? "dark" : "light"); }}>Ganti tema terang / gelap</Button></div><div className="plan-card"><h2>Koneksi</h2><p>Firebase: {config.firebase ? config.firebase.projectId : "Belum tersedia"}</p><p>DeepSeek: {config.aiReady ? `Kunci tersedia di server · ${config.model}` : "Belum tersedia"}</p><p className="help-note">Kunci AI tetap berada di server. Tech stack proyek tidak mengubah integrasi Rencanain.</p></div></section>}
    {pathname === "/" && <><div className="page-heading"><div className="page-heading-row"><div className="page-heading-title"><div className="workspace-caption">Ruang untuk rencana berikutnya</div><h1>Mulai dari <span>idenya.</span></h1><p>Tak perlu sudah rapi. Ceritakan masalah yang ingin Anda selesaikan.</p></div></div></div><div className="dashboard-layout"><div><div className="planning-rail" aria-label="Alur penyusunan rencana"><span><PenLine size={14} /> Ide awal</span><ArrowRight size={14} /><span>Kebutuhan</span><ArrowRight size={14} /><span>PRD &amp; tugas</span></div><section className="composer"><div className="composer-head"><span><PenLine size={17} /> Ide proyek</span><span><i className="save-dot" /> Draft otomatis</span></div><Textarea value={idea} onChange={e => { setIdea(e.target.value); persist("aipp-idea", e.target.value); }} aria-label="Ide aplikasi" placeholder="Saya ingin membuat aplikasi untuk… Siapa yang menggunakannya, dan masalah apa yang perlu diselesaikan?" maxLength={4000} /><div className="composer-bottom"><span>5 pertanyaan sebelum rencana disusun.</span><Button disabled={writeBlocked || idea.trim().length < 20} onClick={clarify}>Perjelas ide <ArrowRight size={16} /></Button></div></section><div className="stats-row">{[{ label: "Proyek", icon: Files }, { label: "Fase", icon: Layers }, { label: "Tugas", icon: ListTodo }, { label: "Selesai", icon: CheckCheck }].map(({ label, icon: Icon }, i) => <div className="stat" key={label}><div className="stat-label"><Icon />{label}</div><div className="stat-value">{!projects.length && (loadingProjects || projectError) ? "—" : totals[i]}</div></div>)}</div><div className="section-title"><h2>Proyek terbaru</h2><span className="eyebrow">{projectError ? "Belum diperbarui" : `${projects.length} proyek`}</span></div>{projectCards(projects.slice(0, 3))}</div><aside className="tips-panel"><h2>Biar rencananya jelas.</h2>{[["01", "Mulai dari masalah", "Apa yang sulit dilakukan sekarang, dan siapa yang mengalaminya?"], ["02", "Batasi versi pertama", "Tentukan tiga fitur yang benar-benar perlu ada sebelum dirilis."], ["03", "Tentukan selesai", "Setiap fitur punya kriteria yang bisa diperiksa, bukan sekadar daftar ide."]].map(([n, name, text]) => <div className="tip" key={n}><span>{n}</span><div><h3>{name}</h3><p>{text}</p></div></div>)}</aside></div></>}
  </VisualMotion></SidebarInset></SidebarProvider>;
}
