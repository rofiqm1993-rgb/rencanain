import { tanggalRingkas, type AccountSnapshot } from "@/lib/account";

type Ringkasan = { label: string; meta: string; tone: "pro" | "free" | "warning" | "waiting" };

function ringkasan(account: AccountSnapshot | null): Ringkasan {
  if (!account) return { label: "Memeriksa paket…", meta: "", tone: "waiting" };
  const pro = account.package === "pro";
  const sampai = tanggalRingkas(account.expiresAt);
  return {
    label: pro ? "Pro 30 Hari" : "Beta Gratis",
    meta: account.readOnly ? "masa aktif berakhir" : pro ? (sampai ? `s/d ${sampai}` : "aktif") : `${account.remaining} PRD AI tersisa`,
    tone: account.readOnly ? "warning" : pro ? "pro" : "free"
  };
}

// Status paket: "pill" kompak untuk header, "card" lengkap untuk halaman Pengaturan.
export default function AccountStatus({ account, variant = "pill" }: { account: AccountSnapshot | null; variant?: "pill" | "card" }) {
  const { label, meta, tone } = ringkasan(account);
  const kuota = account ? `Kuota AI ${account.remaining} tersedia dari ${account.limit} · ${account.used} terpakai${account.reserved > 0 ? ` · ${account.reserved} sedang diproses` : ""}` : "Status paket sedang dibaca dari server.";
  if (variant === "pill") return <span className="account-pill" data-tone={tone} role="status" title={`${label}${meta ? ` · ${meta}` : ""} · ${kuota}`}>
    <span className="account-pill-dot" aria-hidden="true" />
    <span className="account-pill-label">{label}</span>
    {meta && <span className="account-pill-meta">{meta}</span>}
  </span>;
  const sampai = account ? tanggalRingkas(account.expiresAt) : "";
  return <div className="account-card" data-tone={tone} role="status">
    <div className="account-card-head">
      <span className="account-pill" data-tone={tone}><span className="account-pill-dot" aria-hidden="true" /><span className="account-pill-label">{label}</span></span>
      {meta && <span className="account-card-meta">{meta}</span>}
    </div>
    <dl className="account-facts">
      <div><dt>Kuota AI</dt><dd>{account ? `${account.remaining} tersedia dari ${account.limit}` : "Sedang dibaca…"}</dd></div>
      <div><dt>Sudah terpakai</dt><dd>{account ? `${account.used}${account.reserved > 0 ? ` · ${account.reserved} sedang diproses` : ""}` : "—"}</dd></div>
      <div><dt>Masa aktif</dt><dd>{sampai ? `sampai ${sampai}` : account ? "Berlaku selama periode paket" : "—"}</dd></div>
    </dl>
    {account?.readOnly && <p className="account-card-warning">Masa aktif Pro berakhir. Proyek lama tetap bisa dibaca dan diekspor; pembuatan proyek dan perubahan tugas dinonaktifkan.</p>}
  </div>;
}
