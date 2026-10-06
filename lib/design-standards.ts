// Keep these export requirements aligned with the token values in design.md.
export const DESIGN_STANDARD = {
  source: "design.md",
  colors: {
    primary: "#2789D8",
    accent: "#50B0FF",
    background: "#1C1C1D",
    surface: "#BFEAFF",
    textPrimary: "#FFFFFF",
    textSecondary: "#A1A1AA",
    border: "#2A2A2B",
  },
  typography: {
    display: "Inter 500, 64px/1.04 pada desktop; skalakan proporsional di mobile",
    body: "Inter 400, 16px/1.6",
    label: "JetBrains Mono 600, 12px/1.2",
  },
  spacing: "Basis 8px; gap 16px; padding kartu 24px; padding section desktop 80px",
  radius: "Kartu dan control 8px; pill 9999px",
  states: [
    "Setiap alur data memiliki state loading, kosong, berhasil, dan error dengan umpan balik yang jelas.",
    "Aksi yang sedang diproses mencegah pengiriman ganda; kegagalan tidak ditampilkan sebagai keberhasilan.",
  ],
  responsive: [
    "Pada viewport 375px, konten tidak meluber horizontal dan teks tetap terbaca tanpa zoom.",
    "Navigasi dan CTA utama tetap dapat dijangkau di ponsel; komponen kompleks ditumpuk atau disederhanakan.",
  ],
};
