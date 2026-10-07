"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, ListChecks, Route } from "lucide-react";
import { Button } from "./ui/button";

const examples = [
  { title: "Inventori toko", description: "Catat barang masuk dan keluar tanpa kehilangan jejak stok.", features: ["Daftar produk", "Pergerakan stok", "Peringatan stok rendah"] },
  { title: "Keuangan keluarga", description: "Pahami pengeluaran bersama dan batas anggaran bulanan.", features: ["Catat transaksi", "Atur kategori", "Ringkasan bulanan"] },
  { title: "Pemesanan jasa", description: "Bantu pelanggan memilih layanan dan jadwal yang tersedia.", features: ["Daftar layanan", "Pilih jadwal", "Konfirmasi pesanan"] },
];
const steps = [
  { icon: Route, title: "Perjelas kebutuhan", description: "Lima pertanyaan membantu menentukan pengguna, fitur wajib, dan batas versi pertama." },
  { icon: FileText, title: "Susun spesifikasinya", description: "Tinjau tech stack, lalu susun PRD dengan fase, fitur, dan kriteria penerimaan." },
  { icon: ListChecks, title: "Mulai mengerjakan", description: "Simpan proyek, tandai tugas yang selesai, atau ekspor Markdown untuk dibawa ke editor Anda." },
];

export function ExamplePreview() {
  const [index, setIndex] = useState(0);
  const example = examples[index];
  return <section className="example-preview" aria-label="Contoh struktur rencana proyek">
    <div className="example-top"><span><FileText size={15} /> Contoh tampilan</span><span className="mono">.md</span></div>
    <div aria-live="polite" aria-atomic="true"><h2>{example.title}</h2><p>{example.description}</p><div className="example-phase"><span className="example-phase-line" /><strong>Fase pertama</strong><span>MVP</span></div><ul>{example.features.map(feature => <li key={feature}><Check size={14} />{feature}</li>)}</ul></div>
    <div className="example-next-phases" aria-label="Contoh fase lanjutan"><div><Route size={16} /><span>Periksa kualitas<small>Alur penggunaan dan akses data</small></span></div><div><ListChecks size={16} /><span>Uji bersama pengguna<small>Evaluasi kebutuhan berikutnya</small></span></div></div>
    <div className="example-footer"><span className="muted">{index + 1} dari {examples.length} contoh</span><div><Button variant="ghost" size="icon" aria-label="Contoh sebelumnya" onClick={() => setIndex((index + examples.length - 1) % examples.length)}><ArrowLeft /></Button><Button variant="ghost" size="icon" aria-label="Contoh berikutnya" onClick={() => setIndex((index + 1) % examples.length)}><ArrowRight /></Button></div></div>
  </section>;
}

function FeatureVisual({ index }: { index: number }) {
  return <div className="feature-visual" aria-hidden="true">
    {index === 0 ? <><div className="feature-visual-top"><Route size={16} /><span>Siapa penggunanya?</span><small>1 / 5</small></div><div className="feature-answer is-selected"><Check size={14} /> Pemilik usaha / UMKM</div><div className="feature-answer"><span className="feature-empty-check" /> Tim internal</div><div className="feature-mini-track"><i /></div></> : index === 1 ? <><div className="feature-visual-top"><FileText size={16} /><span>Rencana MVP</span><small>.md</small></div><div className="feature-doc-line"><b>Tujuan</b><span>Stok barang selalu tercatat.</span></div><div className="feature-doc-line"><b>Fitur wajib</b><span>Catat barang · Pantau stok</span></div><div className="feature-doc-tags"><span>MVP</span><ArrowRight size={14} /><span>Kualitas</span><ArrowRight size={14} /><span>Evaluasi</span></div></> : <><div className="feature-visual-top"><ListChecks size={16} /><span>Langkah berikutnya</span><small>1 / 3</small></div><div className="feature-mini-task is-done"><Check size={14} /><span>Tentukan data produk</span></div><div className="feature-mini-task"><span className="feature-empty-check" /><span>Buat form barang masuk</span></div><div className="feature-mini-task"><span className="feature-empty-check" /><span>Uji alur inventori</span></div></>}
  </div>;
}

export default function EntryGuide() {
  return <section className="entry-guide entry-guide--visual" id="cara-kerja" aria-labelledby="guide-title"><div className="guide-intro"><h2 id="guide-title">Ide besar.<br /><span>Langkah yang jelas.</span></h2><p className="scroll-copy">{"Rencanain membantu memecah ide menjadi keputusan kecil yang bisa Anda tinjau dan kerjakan.".split(" ").map((word, i) => <span key={i}>{word} </span>)}</p></div><div className="guide-cards">{steps.map(({title,description}, i) => <article className="guide-card" key={title}><FeatureVisual index={i} /><h3>{title}</h3><p>{description}</p></article>)}</div></section>;
}
