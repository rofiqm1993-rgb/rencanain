"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import FeedbackNotice from "./feedback-notice";
import { requireConnection, withPendingNotice } from "@/lib/user-errors";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { firebaseAuth, authError } from "@/lib/firebase-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function LoginPanel({ configured, onDemo }: { configured: boolean; onDemo: () => void }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const mounted = useRef(true), loginLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function login(google = false) {
    if (loginLock.current) return;
    loginLock.current = true; setBusy(true); setError(""); setPending("");
    try {
      requireConnection();
      const auth = firebaseAuth();
      const operation = google ? signInWithPopup(auth, new GoogleAuthProvider()) : register ? createUserWithEmailAndPassword(auth, email.trim(), password) : signInWithEmailAndPassword(auth, email.trim(), password);
      await withPendingNotice(operation, () => { if (mounted.current) { const message = google ? "Selesaikan login pada jendela Google. Jika jendelanya tidak terlihat, periksa apakah browser memblokir popup." : "Login masih menunggu respons. Periksa koneksi internet dan tunggu sebentar; Anda tidak perlu mengirim formulir lagi."; setPending(message); toast.info(message); } });
    } catch (e) { if (mounted.current) { const message = authError(e); setError(message); toast.error(message); } }
    finally { loginLock.current = false; if (mounted.current) { setBusy(false); setPending(""); } }
  }
  return <section className="auth-panel"><h2>{register ? "Buat akun Rencanain" : "Masuk ke Rencanain"}</h2><p>Proyek dan progres Anda tersimpan per akun.</p><form onSubmit={e => { e.preventDefault(); void login(); }}><div className="auth-fields"><label><span className="field-label">Email</span><Input type="email" autoComplete="email" placeholder="nama@email.com" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy || !configured} /></label><label><span className="field-label">Kata sandi</span><Input type="password" autoComplete={register ? "new-password" : "current-password"} placeholder="Minimal 6 karakter" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy || !configured} /></label></div><Button type="submit" className="auth-submit" disabled={busy || !configured}>{busy ? "Menghubungkan…" : register ? "Buat akun" : "Masuk"}</Button></form><Button variant="ghost" className="full-button" disabled={busy || !configured} onClick={() => { setRegister(!register); setError(""); }}>{register ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}</Button><Button variant="outline" className="full-button" disabled={busy || !configured} onClick={() => void login(true)}>Masuk dengan Google</Button>{error && <FeedbackNotice message={error} />}{pending && <FeedbackNotice message={pending} warning />}{!configured && <p className="notice">Login akun belum tersedia. Gunakan mode demo untuk menyusun rencana lokal.</p>}<div className="auth-divider">atau mulai tanpa akun</div><Button variant="outline" className="full-button" disabled={busy} onClick={onDemo}>Lanjut dengan mode demo</Button><p className="fine-print">Mode demo menyimpan proyek di browser ini. Pada preview lokal, API AI dapat dipakai bila kunci server tersedia.</p></section>;
}
