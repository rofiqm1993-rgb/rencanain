import type { ClarificationDraft } from "./clarification";

export const TECH_STACK_FIELDS = {
  frontend: ["React + Vite", "Next.js", "Vue"],
  backend: ["Firebase", "Supabase", "Next.js API routes", "Node.js (Express)", "Cloudflare Workers", "Tanpa backend"],
  database: ["Firestore", "PostgreSQL", "Cloudflare D1", "Tanpa database"],
  deployment: ["Firebase Hosting", "Vercel", "Cloudflare", "VPS", "Hosting statis"],
} as const;
export type TechStack = { [K in keyof typeof TECH_STACK_FIELDS]: (typeof TECH_STACK_FIELDS)[K][number] };
export const STACK_LABELS: Record<keyof TechStack, string> = { frontend: "Frontend", backend: "Backend", database: "Database", deployment: "Deployment" };
export function isTechStack(value: unknown): value is TechStack {
  if (!value || typeof value !== "object") return false;
  return (Object.keys(TECH_STACK_FIELDS) as (keyof TechStack)[]).every(key => (TECH_STACK_FIELDS[key] as readonly unknown[]).includes((value as TechStack)[key]));
}
export function draftFingerprint(draft: ClarificationDraft) { return JSON.stringify([draft.idea, draft.answers, draft.monetization]); }
export function usesMidtrans(draft: ClarificationDraft): boolean {
  return /midtrans/i.test([draft.idea, ...draft.answers.flat(), ...Object.values(draft.monetization ?? {}).flat()].join(" "));
}
export function recommendStack(draft: ClarificationDraft): { stack: TechStack; reasons: string[] } {
  const text = [draft.idea, ...draft.answers.flat(), ...Object.values(draft.monetization ?? {}).flat()].join(" ").toLowerCase();
  const needsServer = /webhook|payment|pembayaran|midtrans|seo|server-side|sql|relasional|berbayar|langganan/.test(text);
  const firebaseRequested = /firebase|firestore|firebase auth/.test(text);
  if (needsServer && (firebaseRequested || usesMidtrans(draft))) return {
    stack: { frontend: "Next.js", backend: "Next.js API routes", database: "Firestore", deployment: "Vercel" },
    reasons: ["Pembayaran/webhook memerlukan route server; Firestore tetap dapat digunakan sebagai penyimpanan per akun.", "Firebase Auth menangani identitas, Firestore Rules membatasi akses klien, dan notifikasi Midtrans diproses server saat Midtrans dipilih."],
  };
  if (needsServer) return {
    stack: { frontend: "Next.js", backend: "Next.js API routes", database: "PostgreSQL", deployment: "Vercel" },
    reasons: ["Kebutuhan webhook, SEO, atau data relasional memerlukan proses server dan struktur data yang jelas.", "PostgreSQL adalah saran awal yang dapat diganti; pembayaran sendiri tidak mewajibkan database tertentu."],
  };
  return { stack: { frontend: "React + Vite", backend: "Firebase", database: "Firestore", deployment: "Firebase Hosting" }, reasons: ["Alur MVP berfokus pada interaksi pengguna dan data per akun.", "Firebase menyediakan autentikasi serta penyimpanan tanpa perlu mengelola server sendiri.", /offline/.test(text) ? "Kebutuhan offline perlu persistence Firestore dan strategi sinkronisasi yang diuji." : "Frontend dapat diterbitkan sebagai aset statis, sementara akses data dilindungi rules Firestore."] };
}
export function stackConflicts(stack: TechStack, draft?: ClarificationDraft): string[] {
  const notes: string[] = [];
  if (draft && usesMidtrans(draft) && !["Next.js API routes", "Node.js (Express)", "Cloudflare Workers"].includes(stack.backend)) notes.push("Midtrans memerlukan runtime server untuk membuat Snap token dan menerima webhook. Pilih backend dengan route server.");
  if (stack.backend === "Firebase" && stack.database !== "Firestore") notes.push("Backend Firebase pada rekomendasi ini menggunakan Firestore.");
  if (stack.backend === "Supabase" && stack.database !== "PostgreSQL") notes.push("Supabase menggunakan PostgreSQL.");
  if (stack.backend === "Next.js API routes" && stack.frontend !== "Next.js") notes.push("Next.js API routes memerlukan frontend Next.js pada konfigurasi ini.");
  if (stack.backend === "Next.js API routes" && !["Vercel", "VPS"].includes(stack.deployment)) notes.push("API routes memerlukan runtime server. Pilih Vercel atau VPS; hosting statis saja tidak menjalankannya.");
  if (stack.backend === "Node.js (Express)" && stack.deployment !== "VPS") notes.push("Server Express pada konfigurasi ini memerlukan VPS atau layanan Node yang setara.");
  if (stack.backend === "Cloudflare Workers" && stack.deployment !== "Cloudflare") notes.push("Cloudflare Workers perlu deployment Cloudflare.");
  if (stack.database === "Cloudflare D1" && stack.backend !== "Cloudflare Workers") notes.push("D1 pada konfigurasi ini diakses dari Cloudflare Workers.");
  if (stack.backend === "Tanpa backend" && stack.database !== "Tanpa database") notes.push("Penyimpanan per akun memerlukan backend atau layanan database yang memiliki autentikasi.");
  if (stack.frontend === "Next.js" && stack.deployment === "Hosting statis") notes.push("Hosting statis hanya mendukung hasil export Next.js; fitur server tidak ikut berjalan.");
  return notes;
}
export function alignStack(stack: TechStack, draft?: ClarificationDraft): TechStack {
  const next = { ...stack };
  if (draft && usesMidtrans(draft) && !["Next.js API routes", "Node.js (Express)", "Cloudflare Workers"].includes(next.backend)) {
    next.frontend = "Next.js";
    next.backend = "Next.js API routes";
    next.deployment = "Vercel";
  }
  if (next.backend === "Firebase") next.database = "Firestore";
  if (next.backend === "Supabase") next.database = "PostgreSQL";
  if (next.backend === "Next.js API routes") { next.frontend = "Next.js"; next.deployment = "Vercel"; }
  if (next.backend === "Node.js (Express)") next.deployment = "VPS";
  if (next.backend === "Cloudflare Workers" || next.database === "Cloudflare D1") { next.backend = "Cloudflare Workers"; next.deployment = "Cloudflare"; }
  if (next.backend === "Tanpa backend") next.database = "Tanpa database";
  if (next.frontend === "Next.js" && next.deployment === "Hosting statis") next.deployment = "Vercel";
  return next;
}
