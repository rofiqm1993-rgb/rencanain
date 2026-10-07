import type { AccountSnapshot } from "@/lib/account";
export default function AccountStatus({ account }: { account: AccountSnapshot | null }) {
  return <div className="notice" role="status">
    <strong>{account ? account.package === "pro" ? "Pro 30 Hari" : "Beta Gratis" : "Memeriksa paket…"}</strong>
    {account && <p>Kuota AI: {account.remaining} tersedia / {account.limit} · {account.used} terpakai{account.reserved > 0 ? ` · ${account.reserved} sedang diproses` : ""}{account.expiresAt ? ` · Masa aktif sampai ${new Date(account.expiresAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB` : ""}</p>}
    {account?.readOnly && <p>Masa aktif Pro berakhir. Proyek lama tetap bisa dibaca dan diekspor. Pembuatan proyek dan perubahan tugas dinonaktifkan.</p>}
  </div>;
}
