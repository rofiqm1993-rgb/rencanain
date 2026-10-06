"use client";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TECH_STACK_FIELDS, STACK_LABELS, recommendStack, stackConflicts, alignStack, type TechStack } from "@/lib/tech-stack";
import type { ClarificationDraft } from "@/lib/clarification";

export default function TechStackSelector({ draft, stack, onChange, onBack, onContinue }: { draft: ClarificationDraft; stack: TechStack; onChange: (value: TechStack) => void; onBack: () => void; onContinue: () => void }) {
  const recommendation = recommendStack(draft), conflicts = stackConflicts(stack, draft);
  return <section className="clarification-panel"><div className="eyebrow">Fondasi teknis</div><h1>Pilih fondasi proyeknya.</h1><p className="muted">Rekomendasi berasal dari kebutuhan Anda. Pilihan ini menjadi spesifikasi proyek; layanan Rencanain tetap memakai konfigurasi yang sudah terpasang.</p>
    <Tabs defaultValue="recommendation"><TabsList><TabsTrigger value="recommendation">Rekomendasi</TabsTrigger><TabsTrigger value="manual">Pilihan manual</TabsTrigger></TabsList>
      <TabsContent value="recommendation"><div className="plan-card"><h2>Untuk MVP ini</h2><dl className="stack-summary">{Object.entries(recommendation.stack).map(([key, value]) => <div key={key}><dt>{STACK_LABELS[key as keyof TechStack]}</dt><dd>{value}</dd></div>)}</dl><ul className="plain-list">{recommendation.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><Button variant="outline" onClick={() => onChange(recommendation.stack)}>Gunakan rekomendasi</Button></div></TabsContent>
      <TabsContent value="manual"><p className="help-note">Ubah sesuai pengalaman atau kebutuhan proyek. Pilihan tersimpan tanpa diganti otomatis.</p></TabsContent>
    </Tabs>
    <div className="stack-fields">{(Object.keys(TECH_STACK_FIELDS) as (keyof TechStack)[]).map(key => <div key={key}><label className="field-label" htmlFor={`stack-${key}`}>{STACK_LABELS[key]}</label><Select value={stack[key]} onValueChange={value => onChange({ ...stack, [key]: value })}><SelectTrigger id={`stack-${key}`} aria-label={STACK_LABELS[key]}><SelectValue /></SelectTrigger><SelectContent>{TECH_STACK_FIELDS[key].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>)}</div>
    {conflicts.length > 0 ? <div className="notice" role="status"><strong>Pilihan belum selaras</strong><ul>{conflicts.map(note => <li key={note}>{note}</li>)}</ul><Button variant="outline" onClick={() => onChange(alignStack(stack, draft))}>Selaraskan pilihan</Button></div> : <p className="help-note">Pilihan selaras. Tinjau kembali saat kebutuhan teknis berubah.</p>}
    <div className="wizard-actions"><Button variant="outline" onClick={onBack}>Kembali ke kuesioner</Button><Button disabled={conflicts.length > 0} onClick={onContinue}>Lanjut ke generator PRD</Button></div>
  </section>;
}
