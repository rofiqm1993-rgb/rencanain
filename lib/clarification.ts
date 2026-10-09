export type ClarificationDraft = {
  idea: string;
  answers: string[][];
  monetization?: MonetizationAnswers;
  step: number;
  completed: boolean;
};

export type MonetizationAnswers = {
  entitlements: string[];
  quota: string[];
  paymentFailure: string[];
};

export const monetizationQuestionTitles = [
  "Apa perbedaan hak akses pengguna Free dan Pro?",
  "Bagaimana batas kuota dan kapan kuota direset?",
  "Apa yang terjadi jika pembayaran gagal, tertunda, atau kedaluwarsa?",
] as const;

const monetizationPattern = /midtrans|monetis(?:asi|ation)|berbayar|pembayaran|payment|langganan|subscription|premium|upgrade|billing|pricing|paket\s+(?:free|pro)|(?:free|pro)\s+(?:tier|plan|paket)|kuota\s+(?:gratis|berbayar|pro)/i;

export function hasMonetizationIntent(draft: Pick<ClarificationDraft, "idea" | "answers">): boolean {
  return monetizationPattern.test([draft.idea, ...draft.answers.flat()].join(" "));
}

export function monetizationAnswers(draft: ClarificationDraft): MonetizationAnswers {
  return draft.monetization ?? { entitlements: [], quota: [], paymentFailure: [] };
}

export function clarificationQuestions(draft: ClarificationDraft): string[] {
  return hasMonetizationIntent(draft) ? [...questionTitles, ...monetizationQuestionTitles] : [...questionTitles];
}

export function newDraft(idea: string): ClarificationDraft {
  return { idea, answers: Array.from({ length: 5 }, () => []), step: 0, completed: false };
}

export function readDraft(raw: string | null): ClarificationDraft | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data.idea !== "string" || !Array.isArray(data.answers) || data.answers.length !== 5) return null;
    if (!data.answers.every((answer: unknown) => Array.isArray(answer) && answer.every(value => typeof value === "string" && value.length <= 160))) return null;
    const extra = data.monetization;
    if (extra !== undefined && (!extra || typeof extra !== "object" || !["entitlements", "quota", "paymentFailure"].every(key => Array.isArray(extra[key]) && extra[key].length <= 8 && extra[key].every((value: unknown) => typeof value === "string" && value.length <= 160)))) return null;
    const answers = data.answers.map((answer: string[], index: number) => [...new Set(answer)].slice(0, index === 2 ? 3 : 8));
    const needsExtra = hasMonetizationIntent({ idea: data.idea, answers });
    const monetization = needsExtra && extra ? Object.fromEntries(["entitlements", "quota", "paymentFailure"].map(key => [key, [...new Set(extra[key] as string[])]])) as MonetizationAnswers : undefined;
    return {
      idea: data.idea.slice(0, 4000),
      answers,
      monetization,
      step: needsExtra && data.completed === true && !extra ? 5 : Number.isInteger(data.step) ? Math.max(0, Math.min(needsExtra ? 7 : 4, data.step)) : 0,
      completed: data.completed === true && (!needsExtra || !!extra),
    };
  } catch {
    return null;
  }
}

export function featureOptions(idea: string): string[] {
  const text = idea.toLowerCase();
  if (/daftar belanja|belanja|shopping/.test(text)) return ["Buat daftar belanja", "Tandai barang yang sudah dibeli", "Kelompokkan barang", "Bagikan daftar dengan keluarga", "Cari barang di daftar", "Lihat riwayat belanja"];
  if (/stok|inventori|gudang|persediaan/.test(text)) return ["Catat barang masuk dan keluar", "Pantau stok barang", "Peringatan stok minimum", "Laporan pergerakan barang", "Cari barang", "Ekspor data stok"];
  if (/keuangan|uang|anggaran|pengeluaran|budget/.test(text)) return ["Catat pemasukan dan pengeluaran", "Atur kategori transaksi", "Tetapkan anggaran", "Ringkasan bulanan", "Cari transaksi", "Ekspor laporan"];
  if (/belajar|kuliah|pelajar|kursus|pendidikan/.test(text)) return ["Kelola materi belajar", "Latihan dan kuis", "Pantau progres belajar", "Jadwal belajar", "Cari materi", "Simpan catatan"];
  if (/booking|reservasi|janji|jadwal/.test(text)) return ["Lihat jadwal tersedia", "Buat reservasi", "Kelola pembatalan", "Pengingat jadwal", "Riwayat reservasi", "Kelola layanan"];
  return ["Buat dan kelola data utama", "Cari dan filter data", "Lihat ringkasan aktivitas", "Simpan riwayat perubahan", "Pengingat aktivitas", "Ekspor data"];
}

export const questionTitles = [
  "Siapa yang paling membutuhkan aplikasi ini?",
  "Apa yang perlu pengguna lihat saat pertama membuka app?",
  "Tiga fitur apa yang wajib ada di versi pertama?",
  "Apa yang membuat aplikasi ini nyaman digunakan?",
  "Apa alasan pengguna kembali menggunakan app?",
];
