"use client";

import { useState } from "react";
import { Check, FileText, GitBranch, ListChecks, ArrowDown, ChevronRight } from "lucide-react";

const views = [{ id: "document", label: "Dokumen PRD", icon: FileText }, { id: "flow", label: "Diagram", icon: GitBranch }, { id: "tasks", label: "Checklist", icon: ListChecks }] as const;
const taskLabels = ["Tentukan data produk", "Buat form barang masuk", "Tampilkan peringatan stok"];

export default function ProductShowcase() {
  const [view, setView] = useState<string>("document");
  const [done, setDone] = useState([true, false, false]);
  const completed = done.filter(Boolean).length;

  return <section className="product-showcase" aria-label="Contoh antarmuka Rencanain">
    <div className="showcase-chrome"><span className="showcase-window-dots" aria-hidden="true"><i /><i /><i /></span><span>rencanain<span className="showcase-brand-dot">.</span><span className="showcase-location"> / ruang proyek</span></span><span className="showcase-example">Contoh interaktif</span></div>
    <div className="showcase-project"><div><span className="showcase-caption">Dari satu ide, rencana mulai terbentuk.</span><h2>Stok — rencana MVP</h2></div><span className="showcase-project-meta">3 fase <span aria-hidden="true">·</span> 3 fitur utama</span></div>
    <div className="showcase-switcher" role="group" aria-label="Pilih cuplikan produk">{views.map(({id,label,icon:Icon}) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}><Icon size={16} /><span>{label}</span></button>)}</div>
    <div className="showcase-panels">
      <article className={"showcase-panel showcase-document " + (view === "document" ? "is-active" : "")} aria-labelledby="showcase-document-title">
        <div className="showcase-panel-heading"><FileText size={17} /><h3 id="showcase-document-title">Dokumen PRD</h3><span>.md</span></div>
        <div className="showcase-document-body"><span className="showcase-caption">Ringkasan produk</span><h4>Persediaan rapi.<br />Operasional lebih pasti.</h4><p>Aplikasi inventori untuk pemilik toko yang ingin mencatat barang masuk, barang keluar, dan stok minimum.</p><div className="showcase-document-section"><strong>Fitur wajib versi pertama</strong><ol><li>Catat pergerakan barang</li><li>Pantau jumlah stok</li><li>Peringatan stok minimum</li></ol></div><div className="showcase-acceptance"><Check size={15} /><span>Setiap fitur dilengkapi kriteria penerimaan.</span></div></div>
      </article>
      <article className={"showcase-panel showcase-flow " + (view === "flow" ? "is-active" : "")} aria-labelledby="showcase-flow-title">
        <div className="showcase-panel-heading"><GitBranch size={17} /><h3 id="showcase-flow-title">Alur proyek</h3><span>3 fase</span></div>
        <div className="showcase-flow-body"><div className="showcase-flow-node is-current"><span>Fase 1</span><strong>Bangun MVP</strong><div className="showcase-flow-features"><span>Barang masuk / keluar</span><span>Stok & peringatan</span></div></div><ArrowDown className="showcase-flow-arrow" size={20} aria-hidden="true" /><div className="showcase-flow-node"><span>Fase 2</span><strong>Periksa kualitas</strong><small>Alur penggunaan & akses data</small></div><ArrowDown className="showcase-flow-arrow" size={20} aria-hidden="true" /><div className="showcase-flow-node"><span>Fase 3</span><strong>Evaluasi bersama pengguna</strong></div></div>
      </article>
      <article className={"showcase-panel showcase-tasks " + (view === "tasks" ? "is-active" : "")} aria-labelledby="showcase-tasks-title">
        <div className="showcase-panel-heading"><ListChecks size={17} /><h3 id="showcase-tasks-title">Daftar tugas</h3><span>MVP</span></div>
        <div className="showcase-task-body"><div className="showcase-task-progress"><span>Progres contoh</span><strong aria-live="polite">{completed} / 3 selesai</strong></div><progress value={completed} max={3} aria-label="Progres checklist contoh" />
          <div className="showcase-checklist">{taskLabels.map((label,index) => <label key={label} className={done[index] ? "is-done" : ""}><input type="checkbox" checked={done[index]} onChange={() => setDone(values => values.map((value,i) => i === index ? !value : value))} /><span>{label}<small>Fase 1 · Inventori toko</small></span></label>)}</div><p className="showcase-try-note">Coba centang satu tugas.<br />Rencana terasa lebih dekat untuk dikerjakan.</p>
        </div>
      </article>
    </div>
    <div className="showcase-footer"><span>Satu proyek. Dokumen, alur, dan tugas yang saling terhubung.</span><span><FileText size={14} /> Siap diekspor ke Markdown <ChevronRight size={14} /></span></div>
  </section>;
}
