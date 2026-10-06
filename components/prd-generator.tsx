"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { User } from "firebase/auth";
import { authHeaders } from "@/lib/firebase-client";
import type { ClarificationDraft } from "@/lib/clarification";
import type { TechStack } from "@/lib/tech-stack";
import { examplePRD, generatedPlanSchema, type GeneratedPlan } from "@/lib/prd";
import { requestJSON } from "@/lib/client-request";
import { readWithTimeout, userError, withPendingNotice, UserFacingError } from "@/lib/user-errors";
import FeedbackNotice from "./feedback-notice";
import { Button } from "@/components/ui/button";
import PlanView from "./plan-view";
export default function PRDGenerator({ draft, stack, user, aiReady, model, plan, onPlan, onBack, onSave }: { draft: ClarificationDraft; stack: TechStack; user: User | null; aiReady: boolean; model: string; plan: GeneratedPlan | null; onPlan: (plan: GeneratedPlan) => void; onBack: () => void; onSave: (plan: GeneratedPlan) => Promise<void> }) {
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [pending, setPending] = useState("");
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true), savingLock = useRef(false), retry = useRef<"generate" | "save">("generate");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  async function generate() {
    if (abort.current || savingLock.current) return;
    retry.current = "generate";
    const controller = new AbortController(); abort.current = controller; setBusy(true); setError("");
    try {
      const headers = await readWithTimeout(authHeaders(user), 15000, "Sesi akun belum dapat diperiksa karena koneksi lambat. Periksa internet lalu coba lagi.", controller.signal);
      if (controller.signal.aborted) throw new UserFacingError("cancelled", "Penyusunan dibatalkan. Ide, jawaban, dan hasil sebelumnya tetap tersedia.");
      const body = await requestJSON<unknown>("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ draft, stack }), signal: controller.signal });
      const parsed = generatedPlanSchema.safeParse(body);
      if (!parsed.success) throw new UserFacingError("invalid-plan", "Jawaban AI belum memiliki struktur PRD yang bisa dipakai. Coba susun ulang atau pilih contoh lokal; hasil sebelumnya tetap tersedia.");
      if (mounted.current) { onPlan(parsed.data); toast.success("PRD selesai disusun. Tinjau isinya sebelum menyimpan."); }
    } catch (e) { if (mounted.current) { const message = userError(e, "generate"); setError(message); if (e instanceof UserFacingError && e.code === "cancelled") toast.info(message); else toast.error(message); } }
    finally { if (mounted.current) setBusy(false); abort.current = null; }
  }
  async function save() {
    if (!plan || savingLock.current || abort.current) return;
    retry.current = "save"; savingLock.current = true; setSaving(true); setError(""); setPending("");
    try { await withPendingNotice(onSave(plan), () => { if (mounted.current) { const message = "Koneksi penyimpanan sedang lambat. Proyek masih menunggu konfirmasi. Biarkan halaman terbuka dan periksa internet; PRD dapat diekspor sambil menunggu."; setPending(message); toast.warning(message); } }); }
    catch (e) { if (mounted.current) { const message = userError(e, "save"); setError(message); toast.error(message); } }
    finally { savingLock.current = false; if (mounted.current) { setSaving(false); setPending(""); } }
  }
  return <section><div className="page-heading"><div><span className="eyebrow">Rencana proyek</span><h1>Susun rencana kerjanya.</h1><p>Jawaban kuesioner dan tech stack menjadi dasar dokumen, diagram, dan tugas.</p></div></div><div className="generator-toolbar"><Button variant="outline" onClick={onBack} disabled={busy || saving}>Tinjau tech stack</Button><Button variant="outline" disabled={busy || saving} onClick={() => { setError(""); onPlan({ prd: examplePRD(draft, stack), source: "example", normalized: [], draft, stack, generatedAt: new Date().toISOString() }); }}>Buat contoh lokal</Button><Button disabled={!aiReady || busy || saving} onClick={() => void generate()}>{busy ? "Menyusun PRD…" : `Susun dengan DeepSeek`}</Button>{busy && <Button variant="ghost" onClick={() => abort.current?.abort()}>Batalkan</Button>}</div><p className="help-note">{aiReady ? `Model server: ${model}. AI dipanggil ketika Anda menekan tombol susun, setelah kuesioner dan tech stack selesai.` : "Kunci AI belum tersedia di server. Contoh lokal tetap dapat digunakan."}</p>{busy && <p className="notice" role="status">Menyusun tiga fase beserta fitur dan kriteria penerimaan. Proses dapat memerlukan hingga 90 detik.</p>}{error && <FeedbackNotice message={error} onRetry={!busy && !saving ? () => { void (retry.current === "save" ? save() : generate()); } : undefined} />}
    {pending && <FeedbackNotice message={pending} warning />}
    {plan ? <><PlanView plan={plan} /><div className="save-bar"><p className="muted">Simpan ke {user ? "akun Firebase Anda" : "browser ini"} untuk melanjutkan checklist tugas.</p><Button disabled={busy || saving} onClick={() => void save()}>{saving ? "Menunggu konfirmasi…" : "Simpan proyek"}</Button></div></> : <div className="empty-state"><div><h3>PRD belum disusun.</h3><p>Pilih DeepSeek untuk hasil AI, atau contoh lokal untuk melihat struktur tanpa panggilan API.</p></div></div>}
  </section>;
}
