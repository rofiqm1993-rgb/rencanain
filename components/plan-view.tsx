"use client";
import { useId, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ReactFlow, Background, Controls, Position, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { assessPRD, exportMarkdown, taskList, technicalArchitectureFor, type GeneratedPlan } from "@/lib/prd";
import { hasMonetizationIntent, monetizationAnswers, monetizationQuestionTitles } from "@/lib/clarification";
import { DESIGN_STANDARD } from "@/lib/design-standards";

export function downloadPlan(plan: GeneratedPlan, tasks: Record<string, true> = {}) {
  const url = URL.createObjectURL(new Blob([exportMarkdown(plan, tasks)], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `${plan.prd.title.replace(/[^a-z0-9-]/gi, "-").slice(0, 80)}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function MobilePhaseDiagram({ phases }: { phases: GeneratedPlan["prd"]["phases"] }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const selectId = useId();
  const currentIndex = Math.min(phaseIndex, phases.length - 1);
  const phase = phases[currentIndex];
  if (!phase) return null;

  return <section className="mobile-phase-diagram" aria-label="Diagram fase dan fitur">
    <label className="field-label" htmlFor={selectId}>Fase yang ditampilkan</label>
    <select id={selectId} className="diagram-phase-select" value={currentIndex} onChange={event => setPhaseIndex(Number(event.target.value))}>
      {phases.map((item, index) => <option value={index} key={item.id}>{index + 1}. {item.title}</option>)}
    </select>
    <div className="diagram-phase-navigation">
      <Button variant="outline" onClick={() => setPhaseIndex(currentIndex - 1)} disabled={currentIndex === 0} aria-label="Fase sebelumnya">Sebelumnya</Button>
      <span className="mono muted">{currentIndex + 1} / {phases.length}</span>
      <Button variant="outline" onClick={() => setPhaseIndex(currentIndex + 1)} disabled={currentIndex === phases.length - 1} aria-label="Fase berikutnya">Berikutnya</Button>
    </div>
    <div className="diagram-phase-tree" aria-live="polite" aria-atomic="true">
      <h3 className="diagram-phase-node">{phase.title}</h3>
      <ul className="diagram-feature-list" aria-label={`Fitur dalam ${phase.title}`}>
        {phase.features.map(feature => <li className="diagram-feature-node" key={feature.id}>{feature.title}</li>)}
      </ul>
    </div>
  </section>;
}

export default function PlanView({ plan, tasks = {}, onTask, hideTitle = false }: { plan: GeneratedPlan; tasks?: Record<string, true>; onTask?: (id: string, done: boolean) => void; hideTitle?: boolean }) {
  const isMobile = useIsMobile();
  const p = plan.prd, allTasks = taskList(p), nodes: Node[] = [], edges: Edge[] = [];
  const design = p.designSystem ?? DESIGN_STANDARD;
  const architecture = p.technicalArchitecture ?? technicalArchitectureFor(plan.draft, plan.stack);
  const monetization = monetizationAnswers(plan.draft);
  const quality = assessPRD(plan);
  p.phases.forEach((phase, pi) => {
    nodes.push({ id: phase.id, data: { label: phase.title }, sourcePosition: Position.Right, position: { x: pi * 350, y: 0 }, style: { width: 280, background: "var(--accent)", color: "var(--card-foreground)", borderColor: "var(--primary)" } });
    phase.features.forEach((feature, fi) => { nodes.push({ id: feature.id, data: { label: feature.title }, targetPosition: Position.Right, position: { x: pi * 350, y: 115 + fi * 125 }, style: { width: 280, background: "var(--card)", color: "var(--card-foreground)", borderColor: "var(--border)" } }); edges.push({ id: `${phase.id}-${feature.id}`, source: phase.id, target: feature.id, type: "smoothstep" }); });
  });
  return <div className="plan-result"><div className="result-heading"><div><span className="eyebrow">{plan.source === "ai" ? `DeepSeek / ${plan.model}` : "Contoh lokal / berbasis aturan"}</span>{!hideTitle && <h2>{p.title}</h2>}</div><Button variant="outline" onClick={() => downloadPlan(plan, tasks)}>Ekspor Markdown</Button></div>
    {plan.normalized.length > 0 && <p className="notice">Bagian yang dilengkapi atau diselaraskan secara lokal: {plan.normalized.join("; ")}. Tinjau sebelum implementasi.</p>}
    <div className="notice" role="status"><strong>Gerbang mutu: {quality.readyForTechnicalReview ? "Siap untuk review teknis" : "Perlu perbaikan sebelum review teknis"}</strong>{quality.issues.length > 0 && <ul>{quality.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div>
    <Tabs defaultValue="document"><TabsList><TabsTrigger value="document">Dokumen</TabsTrigger><TabsTrigger value="diagram">Diagram</TabsTrigger><TabsTrigger value="tasks">Tugas ({allTasks.length})</TabsTrigger></TabsList>
      <TabsContent value="document"><article className="prd-document"><p>{p.summary}</p>{[["Pengguna", p.audience], ["Tujuan", p.goals], ["Di luar cakupan", p.outOfScope]].map(([label, values]) => <section key={String(label)}><h3>{label}</h3><ul>{(values as string[]).map(v => <li key={v}>{v}</li>)}</ul></section>)}<section><h3>Tech stack</h3><dl className="stack-summary">{Object.entries(plan.stack).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>
        {hasMonetizationIntent(plan.draft) && <section><h3>Aturan monetisasi</h3>{monetizationQuestionTitles.map((question, index) => { const values = [monetization.entitlements, monetization.quota, monetization.paymentFailure][index]; return <div key={question}><h4>{question}</h4><ul>{values.length ? values.map(value => <li key={value}>{value}</li>) : <li>Belum ditentukan; putuskan sebelum implementasi.</li>}</ul></div>; })}</section>}
        <section><h3>User Flow</h3>{p.userFlows.map((flow, index) => <div key={`${flow.actor}-${index}`}><h4>{flow.actor}</h4><p>Pemicu: {flow.trigger}</p><ol>{flow.steps.map((step, stepIndex) => <li key={`${stepIndex}-${step}`}>{step}</li>)}</ol><p>Hasil berhasil: {flow.success}</p><p>Jika gagal: {flow.failure}</p></div>)}</section>
        <section><h3>Matriks izin dan peran</h3>{p.permissionMatrix.length ? <dl className="stack-summary">{p.permissionMatrix.map((row, index) => <div key={`${row.role}-${index}`}><dt>{row.role} · {row.capability}</dt><dd>{row.rule}</dd></div>)}</dl> : <p>Tidak ada paket atau peran khusus yang ditentukan.</p>}</section>
        <section><h3>Sistem desain ({design.source})</h3><h4>Warna</h4><ul>{Object.entries(design.colors).map(([key, value]) => <li key={key}>{key}: {value}</li>)}</ul><h4>Tipografi</h4><ul>{Object.entries(design.typography).map(([key, value]) => <li key={key}>{key}: {value}</li>)}</ul><p>{design.spacing}. {design.radius}.</p><h4>State dan responsivitas</h4><ul>{[...design.states, ...design.responsive].map(value => <li key={value}>{value}</li>)}</ul></section>
        <section><h3>Arsitektur teknis</h3>{[["Route server/API", architecture.serverRoutes], ["Identitas dan akses data", architecture.identityAndData], ["Midtrans Snap dan notifikasi", architecture.paymentNotifications]].filter(([, values]) => (values as string[]).length).map(([label, values]) => <div key={String(label)}><h4>{label}</h4><ul>{(values as string[]).map(value => <li key={value}>{value}</li>)}</ul></div>)}</section>
        {plan.stack.database === "Firestore" && <section><h3>Aturan akses data Firestore</h3><ul>{architecture.identityAndData.map(value => <li key={value}>{value}</li>)}</ul></section>}
        {p.systemAcceptance.length > 0 && <section><h3>Kriteria penerimaan sistem</h3><ol>{p.systemAcceptance.map((item, index) => <li key={index}><strong>Kondisi awal:</strong> {item.precondition}<br /><strong>Tindakan:</strong> {item.action}<br /><strong>Hasil teramati:</strong> {item.expected}</li>)}</ol></section>}
        {p.phases.map(phase => <section className="prd-phase" key={phase.id}><h3>{phase.title}</h3><p className="muted">{phase.goal}</p>{phase.features.map(f => <div className="prd-feature" key={f.id}><h4>{f.title}</h4><p>{f.description}</p><ul>{f.subfeatures.map(t => <li key={t.id}>{t.title}</li>)}</ul><span className="field-label muted">Kriteria penerimaan</span><ol>{f.acceptance.map((item, index) => <li key={index}><strong>Kondisi awal:</strong> {item.precondition}<br /><strong>Tindakan:</strong> {item.action}<br /><strong>Hasil teramati:</strong> {item.expected}</li>)}</ol></div>)}</section>)}
        <section><h3>Model data</h3>{p.dataModel.map(e => <div key={e.name}><h4>{e.name}</h4><ul className="mono">{e.fields.map(f => <li key={f}>{f}</li>)}</ul></div>)}</section><section><h3>Risiko</h3>{p.risks.map(r => <p key={r.risk}><strong>{r.risk}</strong><br />{r.mitigation}</p>)}</section><section><h3>Asumsi terbuka</h3><ul>{p.assumptions.map(a => <li key={a}>{a}</li>)}</ul></section><section><h3>Keputusan terbuka</h3><ul>{p.unresolvedDecisions.length ? p.unresolvedDecisions.map(value => <li key={value}>{value}</li>) : <li>Tidak ada keputusan terbuka yang teridentifikasi oleh generator; tetap tinjau bersama pemilik produk.</li>}</ul></section>
      </article></TabsContent>
      <TabsContent value="diagram">{isMobile ? <MobilePhaseDiagram phases={p.phases} /> : <div className="diagram-frame" aria-label="Diagram fase dan fitur"><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} minZoom={0.2}><Background color="var(--border)" /><Controls showInteractive={false} /></ReactFlow></div>}<p className="help-note">{isMobile ? "Pilih fase untuk melihat fitur di dalamnya. Semua label dapat dibaca tanpa memperbesar tampilan." : "Setiap fase terhubung ke fitur di dalamnya. Gunakan kontrol untuk memperbesar diagram."}</p></TabsContent>
      <TabsContent value="tasks"><p className="help-note">{Object.keys(tasks).length} / {allTasks.length} selesai{!onTask && " · Simpan proyek untuk mencatat progres."}</p>{allTasks.map(t => <label className="task-row" key={t.id}><Checkbox checked={!!tasks[t.id]} disabled={!onTask} onCheckedChange={value => onTask?.(t.id, value === true)} /><span>{t.title}<small>{t.phase} · {t.feature}</small></span></label>)}</TabsContent>
    </Tabs>
  </div>;
}
