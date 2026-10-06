"use client";
import { Button } from "@/components/ui/button";
import FeedbackNotice from "@/components/feedback-notice";
import { useRouter } from "next/navigation";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return <main className="content"><div className="page-heading"><div><div className="eyebrow">RENCANAIN</div><h1>Halaman belum dapat ditampilkan.</h1><p>Coba membuka halaman kembali. Data yang sudah tersimpan tidak dihapus.</p></div></div><FeedbackNotice message="Terjadi kendala saat membuka ruang kerja. Draft yang berhasil disimpan tetap tersedia di browser; proyek akun tetap berada di penyimpanan akun Anda." onRetry={reset} /><Button variant="outline" onClick={() => router.push("/")}>Kembali ke ringkasan</Button></main>;
}
