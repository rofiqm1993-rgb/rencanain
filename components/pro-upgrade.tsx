"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestJSON } from "@/lib/client-request";
import { userError } from "@/lib/user-errors";
import { authHeaders } from "@/lib/firebase-client";
import type { User } from "firebase/auth";
import type { AccountSnapshot, PaymentInfo } from "@/lib/account";

const rupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
const jakarta = (value: string | null | undefined) => value ? `${new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB` : "";
type PaymentOrder = { orderId: string; amount: number; days: number; redirectUrl: string; expiresAt: string };

export default function ProUpgrade({ payments, user, account, onRefresh }: { payments?: PaymentInfo | null; user: User | null; account: AccountSnapshot | null; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false), [waiting, setWaiting] = useState(false);
  const active = !!account && account.package === "pro" && !account.readOnly;
  async function start() {
    if (!user || busy) return;
    // Tab dibuka SEBELUM menunggu jawaban server supaya browser tidak memblokirnya sebagai popup.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const headers = await authHeaders(user);
      const order = await requestJSON<PaymentOrder>("/api/transaction", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" }, 40000);
      if (tab) { tab.location.href = order.redirectUrl; setWaiting(true); toast.info("Selesaikan pembayaran di tab baru. Status Pro diperbarui otomatis setelah pembayaran terverifikasi."); }
      else window.location.assign(order.redirectUrl);
    } catch (error) {
      tab?.close();
      toast.error(userError(error, "pay"));
    } finally { setBusy(false); }
  }
  if (!user) return <p className="help-note">Masuk ke akun Anda untuk mengaktifkan Pro.</p>;
  if (!payments) return <p className="help-note">Status pembayaran belum dapat dibaca dari server. Muat ulang halaman.</p>;
  return <>
    <p>{active ? `Pro aktif sampai ${jakarta(account?.expiresAt)}.` : account ? "Paket Beta Gratis: 1 PRD AI per akun." : "Status paket sedang diperiksa…"}</p>
    {payments.ready ? <>
      <p className="help-note">{rupiah(payments.price)} untuk {payments.days} hari akses Pro{payments.mode === "sandbox" ? " · lingkungan uji (sandbox), belum memakai uang sungguhan" : ""}.</p>
      <div className="composer-bottom">
        <Button disabled={busy} onClick={() => void start()}>{busy ? "Menyiapkan pembayaran…" : active ? `Perpanjang Pro ${payments.days} Hari · ${rupiah(payments.price)}` : `Aktifkan Pro ${payments.days} Hari · ${rupiah(payments.price)}`}</Button>
        <Button variant="outline" disabled={busy} onClick={onRefresh}>Periksa status pembayaran</Button>
      </div>
      {waiting && <p className="help-note" role="status">Setelah pembayaran selesai, tekan <strong>Periksa status pembayaran</strong>. Notifikasi Midtrans kadang tertunda beberapa detik.</p>}
    </> : <p className="help-note">Pembayaran Pro belum aktif: {payments.keyPresent ? "konfigurasi Midtrans atau penyimpanan server belum lengkap." : "Server Key Midtrans belum tersedia di server."} Pengelola perlu memeriksa Secret dan mode pembayaran, lalu men-deploy ulang.</p>}
  </>;
}
