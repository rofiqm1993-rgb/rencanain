"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { clarificationQuestions, featureOptions, hasMonetizationIntent, monetizationAnswers, type ClarificationDraft } from "@/lib/clarification";

function IdeaSummary({ idea, label }: { idea: string; label: string }) {
  return <div className="draft-idea">
    <span className="field-label">{label}</span>
    <p className="draft-idea-preview">{idea}</p>
    <details className="draft-idea-details">
      <summary><span className="idea-show">Lihat ide lengkap</span><span className="idea-hide">Ringkas ide</span></summary>
      <p>{idea}</p>
    </details>
  </div>;
}

type Props = { draft: ClarificationDraft; onChange: (draft: ClarificationDraft) => void; onExit: () => void; onContinue: () => void };

export default function ClarificationWizard({ draft, onChange, onExit, onContinue }: Props) {
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const questions = clarificationQuestions(draft);
  const extra = monetizationAnswers(draft);
  const extraKeys = ["entitlements", "quota", "paymentFailure"] as const;
  const selected = draft.step < 5 ? draft.answers[draft.step] : extra[extraKeys[draft.step - 5]];
  const limit = draft.step === 2 ? 3 : 8;
  const options = [
    ["Pengguna perorangan", "Pemilik usaha / UMKM", "Pelajar / mahasiswa", "Tim internal", "Freelancer / klien"],
    ["Langsung ke aktivitas utama", "Ringkasan data", "Panduan singkat", "Pencarian", "Daftar aktivitas terbaru"],
    featureOptions(draft.idea),
    ["Alur singkat", "Nyaman di ponsel", "Bisa digunakan offline", "Privasi data", "Tampilan mudah dibaca"],
    ["Memantau progres", "Mencatat aktivitas rutin", "Melihat riwayat", "Menerima pengingat", "Mendapat materi baru"],
    ["Free: akses fitur inti", "Pro: fitur tambahan", "Free: ekspor Markdown", "Pro: ekspor dan riwayat lebih luas", "Hak akses belum diputuskan"],
    ["Batas berbeda untuk Free dan Pro", "Kuota per hari", "Kuota per bulan", "Reset mengikuti periode langganan", "Kuota belum diputuskan"],
    ["Akses Pro menunggu pembayaran terverifikasi", "Pengguna tetap di Free saat pembayaran gagal", "Tampilkan status tertunda dan pilihan coba lagi", "Pembayaran kedaluwarsa tidak mengaktifkan Pro"],
  ][draft.step];
  const choices = [...new Set([...options, ...selected])];

  useEffect(() => {
    heading.current?.focus();
  }, [draft.step, draft.completed]);

  function navigate(next: ClarificationDraft) {
    setCustom("");
    setMessage("");
    onChange(next);
  }

  function changeAnswers(values: string[]) {
    if (draft.step < 5) {
      const answers = draft.answers.map((answer, index) => index === draft.step ? values : answer);
      onChange({ ...draft, answers, monetization: hasMonetizationIntent({ idea: draft.idea, answers }) ? draft.monetization : undefined });
    } else {
      onChange({ ...draft, monetization: { ...extra, [extraKeys[draft.step - 5]]: values } });
    }
  }

  function toggle(value: string, checked: boolean) {
    setMessage("");
    if (!checked) { changeAnswers(selected.filter(item => item !== value)); return; }
    if (selected.length >= limit) { setMessage(`Maksimal ${limit} pilihan. Hapus satu pilihan untuk menggantinya.`); return; }
    changeAnswers([...selected, value]);
  }

  function addCustom(event: React.FormEvent) {
    event.preventDefault();
    const value = custom.trim();
    if (!value) return;
    if (selected.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())) { setMessage("Jawaban tersebut sudah dipilih."); return; }
    if (selected.length >= limit) { setMessage(`Maksimal ${limit} pilihan. Hapus satu pilihan untuk menggantinya.`); return; }
    changeAnswers([...selected, value]);
    setCustom("");
    setMessage("");
  }

  function advance(skip = false) {
    const answers = skip && draft.step < 5 ? draft.answers.map((answer, index) => index === draft.step ? [] : answer) : draft.answers;
    const monetization = draft.step >= 5 ? { ...extra, [extraKeys[draft.step - 5]]: skip ? [] : selected } : draft.monetization;
    const next = { ...draft, answers, monetization };
    const lastStep = clarificationQuestions(next).length - 1;
    navigate({ ...next, step: Math.min(lastStep, draft.step + 1), completed: draft.step >= lastStep });
  }

  if (draft.completed) return <section className="clarification-panel">
    <div className="eyebrow">Klarifikasi selesai</div>
    <h1 ref={heading} tabIndex={-1}>Kebutuhannya sudah lebih jelas.</h1>
    <p className="muted">Ide dan jawaban tersimpan di browser ini. Anda bisa meninjaunya kembali sebelum menyusun PRD.</p>
    <IdeaSummary idea={draft.idea} label="Ide awal" />
    <dl className="answer-summary">{questions.map((title, index) => { const values = index < 5 ? draft.answers[index] : extra[extraKeys[index - 5]]; return <div key={title}><dt>{String(index + 1).padStart(2, "0")} / {title}</dt><dd>{values.length ? values.join(" · ") : "Dilewati — belum ditentukan"}</dd></div>; })}</dl>
    <div className="wizard-actions wizard-mobile-footer"><Button variant="outline" onClick={() => navigate({ ...draft, completed: false, step: 0 })}>Tinjau jawaban</Button><Button onClick={onContinue}>Pilih tech stack</Button></div>
  </section>;

  return <section className="clarification-panel" aria-labelledby="question-title">
    <div className="wizard-progress"><span className="eyebrow">Perjelas ide</span><span className="mono muted">{draft.step + 1} / {questions.length}</span></div>
    <Progress value={(draft.step + 1) / questions.length * 100} aria-label={`Langkah ${draft.step + 1} dari ${questions.length}`} className="wizard-progress-bar" />
    <IdeaSummary idea={draft.idea} label="Ide Anda" />
    <h1 id="question-title" ref={heading} tabIndex={-1}>{questions[draft.step]}</h1>
    <p className="wizard-hint">{draft.step === 2 ? "Pilih maksimal 3 fitur. Gunakan jawaban sendiri jika pilihan di bawah belum sesuai." : "Pilih yang sesuai atau tulis jawaban sendiri. Anda boleh melewati pertanyaan ini."}</p>
    <div className="question-choices">{choices.map((choice, index) => <label className={`question-choice ${selected.includes(choice) ? "selected" : ""}`} key={choice}>
      <Checkbox id={`choice-${draft.step}-${index}`} checked={selected.includes(choice)} disabled={!selected.includes(choice) && selected.length >= limit} onCheckedChange={checked => toggle(choice, checked === true)} /><span>{choice}</span>
    </label>)}</div>
    <form className="custom-answer" onSubmit={addCustom}><Input aria-label="Jawaban sendiri" placeholder="Tulis jawaban sendiri…" maxLength={160} value={custom} onChange={event => setCustom(event.target.value)} /><Button type="submit" variant="outline" disabled={!custom.trim() || selected.length >= limit}>Tambahkan</Button></form>
    <p className="selection-count" aria-live="polite">{selected.length} dari {limit} pilihan{message ? ` · ${message}` : ""}</p>
    <div className="wizard-actions wizard-mobile-footer"><Button variant="outline" onClick={() => draft.step === 0 ? onExit() : navigate({ ...draft, step: draft.step - 1 })}>Kembali</Button><div><Button variant="ghost" onClick={() => advance(true)}>Lewati</Button><Button onClick={() => advance()} disabled={!selected.length}>{draft.step === questions.length - 1 ? "Simpan klarifikasi" : "Lanjut"}</Button></div></div>
  </section>;
}
