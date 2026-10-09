import { z } from "zod";
import { clarificationQuestions, featureOptions, hasMonetizationIntent, monetizationAnswers, type ClarificationDraft } from "./clarification";
import { DESIGN_STANDARD } from "./design-standards";
import { isTechStack, recommendStack, usesMidtrans, type TechStack } from "./tech-stack";

const text = z.string().trim().min(1).max(3000);
export const acceptanceCriterionSchema = z.object({ precondition: text, action: text, expected: text });
const acceptanceListSchema = z.array(z.union([acceptanceCriterionSchema, text])).min(1).max(12).transform(items => items.map(item => typeof item === "string" ? { precondition: "Belum dirinci pada PRD lama.", action: "Pengguna menjalankan fitur.", expected: item } : item));
const featureSchema = z.object({ id: text, title: text, description: text, subfeatures: z.array(z.object({ id: text, title: text })).min(1).max(8), acceptance: acceptanceListSchema });
const userFlowSchema = z.object({ actor: text, trigger: text, steps: z.array(text).min(1).max(12), success: text, failure: text });
const permissionSchema = z.object({ role: text, capability: text, rule: text });
const designSchema = z.object({ source: text, colors: z.record(text), typography: z.record(text), spacing: text, radius: text, states: z.array(text), responsive: z.array(text) });
const architectureSchema = z.object({ serverRoutes: z.array(text), identityAndData: z.array(text), paymentNotifications: z.array(text) });
const emptyArchitecture = { serverRoutes: [], identityAndData: [], paymentNotifications: [] };
export const prdSchema = z.object({ title: text, summary: text, audience: z.array(text).min(1).max(8), goals: z.array(text).min(1).max(8), outOfScope: z.array(text).min(1).max(8), phases: z.array(z.object({ id: text, title: text, goal: text, features: z.array(featureSchema).min(2).max(4) })).min(3).max(3), userFlows: z.array(userFlowSchema).max(12).default([]), permissionMatrix: z.array(permissionSchema).max(20).default([]), systemAcceptance: z.array(acceptanceCriterionSchema).max(12).default([]), unresolvedDecisions: z.array(text).max(20).default([]), dataModel: z.array(z.object({ name: text, fields: z.array(text).min(1).max(20) })).min(1).max(12), risks: z.array(z.object({ risk: text, mitigation: text })).min(1).max(10), assumptions: z.array(text).max(12), designSystem: designSchema.default(DESIGN_STANDARD), technicalArchitecture: architectureSchema.default(emptyArchitecture) });
export type PRD = z.infer<typeof prdSchema>;
export type GeneratedPlan = { prd: PRD; source: "ai" | "example"; model?: string; generationId?: string; normalized: string[]; draft: ClarificationDraft; stack: TechStack; generatedAt: string };
export type Project = GeneratedPlan & { id: string; savedAt: string; tasks: Record<string, true> };
const monetizationSchema = z.object({ entitlements: z.array(z.string().max(160)).max(8), quota: z.array(z.string().max(160)).max(8), paymentFailure: z.array(z.string().max(160)).max(8) });
export const generatedPlanSchema = z.object({ prd: prdSchema, source: z.enum(["ai", "example"]), model: z.string().optional(), generationId: z.string().uuid().optional(), normalized: z.array(z.string()).default([]), draft: z.object({ idea: z.string().max(4000), answers: z.array(z.array(z.string().max(160))).length(5), monetization: monetizationSchema.optional(), step: z.number().int().min(0).max(7), completed: z.boolean() }), stack: z.custom<TechStack>(isTechStack), generatedAt: z.string().datetime() });
export const projectSchema = generatedPlanSchema.extend({ id: z.string().min(1), savedAt: z.string().datetime(), tasks: z.record(z.literal(true)).default({}) });
export function taskList(prd: PRD) { return prd.phases.flatMap(phase => phase.features.flatMap(feature => feature.subfeatures.map(task => ({ ...task, phase: phase.title, phaseId: phase.id, feature: feature.title })))); }

function domain(idea: string) {
  if (/keuangan|anggaran|pengeluaran|budget/i.test(idea)) return { name: "Keuangan", entity: "transaksi", fields: ["amount: number (> 0)", "type: income | expense", "category_id: string", "date: date", "note: string (opsional)"] };
  if (/daftar belanja|belanja|shopping/i.test(idea)) return { name: "Belanja", entity: "item_belanja", fields: ["name: string", "quantity: number (> 0)", "unit: string", "done: boolean", "note: string (opsional)"] };
  if (/stok|gudang|inventori|persediaan/i.test(idea)) return { name: "Stok", entity: "barang", fields: ["name: string", "sku: string", "quantity: number (>= 0)", "unit: string"] };
  if (/belajar|kursus|kuliah|pelajar/i.test(idea)) return { name: "Belajar", entity: "materi", fields: ["title: string", "content: string", "status: draft | published"] };
  if (/booking|reservasi|janji/i.test(idea)) return { name: "Reservasi", entity: "reservasi", fields: ["service_id: string", "start_at: datetime", "status: pending | confirmed | cancelled"] };
  return { name: "Proyek", entity: "data_utama", fields: ["name: string", "description: string", "status: string"] };
}
function needsSharedScope(draft: ClarificationDraft): boolean {
  return /keluarga|rumah tangga|tim|organisasi|kelompok|komunitas|kolaborasi|household/i.test([draft.idea, ...draft.answers.flat()].join(" "));
}
function makeFeature(title: string, id: string) {
  return { id, title, description: `Pengguna dapat menjalankan kebutuhan “${title}” pada data miliknya.`, subfeatures: [{ id: `${id}-t1`, title: `Bangun alur utama: ${title}` }, { id: `${id}-t2`, title: `Tangani validasi, kondisi kosong, dan kegagalan: ${title}` }], acceptance: [
    { precondition: "Pengguna masuk dan memiliki hak akses ke data miliknya.", action: `Pengguna menyelesaikan alur ${title} lalu menyimpan hasilnya.`, expected: "Aplikasi menampilkan status berhasil hanya setelah penyimpanan dikonfirmasi; hasil tetap tersedia setelah halaman dimuat ulang." },
    { precondition: "Satu input wajib belum diisi atau layanan simpan gagal.", action: `Pengguna mencoba menyimpan hasil alur ${title}.`, expected: "Input kosong menampilkan pesan pada field terkait; kegagalan simpan tidak mengubah data dan tidak menampilkan status berhasil." },
  ] };
}

function unresolvedFromDraft(draft: ClarificationDraft): string[] {
  const extra = monetizationAnswers(draft);
  const answerSets = [...draft.answers, ...(hasMonetizationIntent(draft) ? [extra.entitlements, extra.quota, extra.paymentFailure] : [])];
  return clarificationQuestions(draft).flatMap((question, index) => answerSets[index]?.length ? [] : [`Tentukan jawaban: ${question}`]);
}

function permissionMatrixFor(draft: ClarificationDraft): PRD["permissionMatrix"] {
  if (!hasMonetizationIntent(draft)) return [];
  const entries = monetizationAnswers(draft).entitlements;
  return ["Free", "Pro"].map(role => ({
    role,
    capability: "Hak akses fitur dan kuota",
    rule: entries.filter(value => new RegExp(`\\b${role}\\b`, "i").test(value)).join("; ") || "Belum ditentukan; putuskan sebelum implementasi.",
  }));
}

function systemAcceptanceFor(draft: ClarificationDraft): PRD["systemAcceptance"] {
  const checks: PRD["systemAcceptance"] = [];
  if (hasMonetizationIntent(draft)) checks.push({
    precondition: "Akun Free atau Pro telah mencapai batas kuota sesuai aturan paket yang diputuskan.",
    action: "Pengguna meminta satu operasi tambahan yang menggunakan kuota.",
    expected: "Route server menolak operasi di atas batas, UI menjelaskan paket dan sisa kuota, serta kegagalan layanan tidak mengurangi kuota.",
  });
  if (usesMidtrans(draft)) checks.push(
    { precondition: "Satu order Midtrans berstatus pending dan signature webhook telah diverifikasi.", action: "Notifikasi sukses untuk order_id yang sama diterima dua kali.", expected: "Status transaksi dan hak Pro diperbarui tepat satu kali; tidak ada entri atau pemberian hak duplikat." },
    { precondition: "Satu order Midtrans masih pending.", action: "Endpoint menerima notifikasi dengan signature tidak valid atau status lama setelah settlement.", expected: "Hak Pro dan status final tidak berubah; kejadian dicatat untuk pemeriksaan server." },
  );
  return checks;
}

export function technicalArchitectureFor(draft: ClarificationDraft, stack: TechStack): PRD["technicalArchitecture"] {
  const nextRoutes = stack.frontend === "Next.js" && stack.backend === "Next.js API routes";
  const firestore = stack.database === "Firestore";
  const midtrans = usesMidtrans(draft);
  return {
    serverRoutes: nextRoutes ? ["Route server/API menjalankan operasi berprivilegi, memvalidasi identitas dan input, serta menyimpan rahasia layanan di server; browser hanya menerima hasil yang diperlukan."] : [],
    identityAndData: firestore ? [
      "Firebase Auth menetapkan identitas pengguna; route server memverifikasi ID token sebelum operasi milik akun.",
      "Firestore Rules membatasi baca/tulis dari klien berdasarkan UID dan hak akses; uji bahwa akun lain tidak dapat mengakses data.",
      "Akses Firestore dari server/Admin SDK memakai izin server dan tidak dibatasi Rules klien; periksa otorisasi lagi pada setiap route server.",
    ] : [],
    paymentNotifications: midtrans ? [
      "Buat token transaksi Midtrans Snap di server dengan Server Key yang tidak dikirim ke browser; harga dan paket dihitung ulang di server.",
      "Sediakan endpoint webhook HTTPS terpisah dari callback browser; verifikasi signature_key Midtrans atau status transaksi melalui GET Status sebelum mengubah hak Pro.",
      "Simpan order_id dan status transaksi; proses notifikasi secara idempoten agar kiriman berulang tidak menggandakan hak akses atau catatan pembayaran.",
      "Tangani pending, settlement/capture yang sah, deny, cancel, dan expire; abaikan status lama yang datang tidak berurutan dan cek GET Status jika status meragukan.",
      "Kegagalan, penundaan, atau penutupan halaman browser tidak boleh mengaktifkan Pro; status dari webhook terverifikasi menjadi sumber kebenaran.",
    ] : [],
  };
}

export function examplePRD(draft: ClarificationDraft, stack: TechStack = recommendStack(draft).stack): PRD {
  const d = domain(draft.idea);
  const must = draft.answers[2].length ? draft.answers[2] : featureOptions(draft.idea).slice(0, 2);
  const first = draft.answers[1].length ? `Pembukaan pertama: ${draft.answers[1].join(", ")}` : "Pembukaan pertama: akses aktivitas utama";
  const comfort = draft.answers[3].length ? draft.answers[3].join(", ") : "Alur sederhana dan pesan validasi yang jelas";
  const returnReason = draft.answers[4].length ? draft.answers[4].join(", ") : "Riwayat aktivitas pengguna";
  return {
    title: `${d.name} — rencana MVP`, summary: draft.idea,
    audience: draft.answers[0].length ? draft.answers[0] : ["Target pengguna belum ditentukan; perlu diklarifikasi sebelum implementasi."],
    goals: [`Menyediakan ${must.length} kebutuhan utama yang dipilih pengguna.`, "Memastikan alur utama dapat digunakan dari awal sampai hasil tersimpan."],
    outOfScope: ["Fitur di luar pilihan MVP belum menjadi komitmen versi pertama.", "Integrasi pembayaran dan kolaborasi real-time hanya masuk bila diminta secara eksplisit."],
    phases: [
      { id: "p1", title: "Fase 1: MVP", goal: "Selesaikan kebutuhan wajib dan pengalaman pembukaan pertama.", features: [...must.map((title, i) => makeFeature(title, `p1-f${i + 1}`)), makeFeature(first, `p1-f${must.length + 1}`)] },
      { id: "p2", title: "Fase 2: Kualitas penggunaan", goal: "Periksa kemudahan penggunaan serta batas akses data.", features: [makeFeature(comfort, "p2-f1"), makeFeature(`Uji akses dan integritas ${d.entity}`, "p2-f2")] },
      { id: "p3", title: "Fase 3: Evaluasi dan retensi", goal: "Uji alasan pengguna kembali dan kesiapan rilis.", features: [makeFeature(returnReason, "p3-f1"), makeFeature("Uji alur utama bersama target pengguna", "p3-f2")] },
    ],
    userFlows: [{ actor: draft.answers[0][0] || "Target pengguna belum ditentukan", trigger: "Pengguna membuka aplikasi untuk menyelesaikan kebutuhan utama.", steps: [first, ...must], success: "Hasil kebutuhan utama tersimpan dan dapat dibuka kembali oleh pemiliknya.", failure: "Validasi atau kegagalan penyimpanan ditampilkan tanpa menyatakan pekerjaan berhasil." }],
    permissionMatrix: permissionMatrixFor(draft),
    systemAcceptance: systemAcceptanceFor(draft),
    unresolvedDecisions: unresolvedFromDraft(draft),
    dataModel: [{ name: d.entity, fields: ["id: string", "owner_id: string", ...(needsSharedScope(draft) ? ["household_id: string"] : []), ...d.fields, "created_at: datetime", "updated_at: datetime"] }],
    risks: [{ risk: "Cakupan melebar sebelum kebutuhan inti selesai.", mitigation: "Gunakan pilihan fitur wajib sebagai batas MVP; pindahkan kebutuhan tambahan ke fase berikutnya." }, { risk: "Data dapat diakses akun yang tidak berwenang bila aturan akses belum diuji.", mitigation: "Batasi akses per pemilik/kelompok dan uji permintaan lintas akun sebelum rilis." }],
    assumptions: ["Ini rancangan berbasis aturan lokal; detail perlu ditinjau sebelum menjadi komitmen kerja.", ...(needsSharedScope(draft) ? ["household_id digunakan sebagai ruang lingkup kelompok; aturan keanggotaan perlu dikonfirmasi."] : []), ...clarificationQuestions(draft).flatMap((question, index) => { const extra = monetizationAnswers(draft); const values = index < 5 ? draft.answers[index] : [extra.entitlements, extra.quota, extra.paymentFailure][index - 5]; return values.length ? [] : [`Pertanyaan ${index + 1} dilewati: ${question}`]; })],
    designSystem: DESIGN_STANDARD,
    technicalArchitecture: technicalArchitectureFor(draft, stack),
  };
}

// Repair missing structure explicitly. The caller displays which parts were supplemented locally.
export function normalizePRD(value: unknown, draft: ClarificationDraft, stack: TechStack = recommendStack(draft).stack): { prd: PRD; normalized: string[] } {
  const fallback = examplePRD(draft, stack), normalized: string[] = [];
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result = { ...fallback };
  for (const key of Object.keys(fallback) as (keyof PRD)[]) {
    if (key === "designSystem" || key === "technicalArchitecture" || key === "systemAcceptance") continue;
    const schema = prdSchema.shape[key];
    const parsed = schema.safeParse(candidate[key]);
    if (parsed.success) Object.assign(result, { [key]: parsed.data });
    else normalized.push(key);
  }
  // Stable IDs keep diagram edges and persisted task progress collision-free.
  result.phases = result.phases.map((p, pi) => ({ ...p, id: `p${pi + 1}`, features: p.features.map((f, fi) => ({ ...f, id: `p${pi + 1}-f${fi + 1}`, subfeatures: f.subfeatures.map((t, ti) => ({ ...t, id: `p${pi + 1}-f${fi + 1}-t${ti + 1}` })) })) }));
  const mandatory = draft.answers[2];
  const opening = draft.answers[1].length ? `Pembukaan pertama: ${draft.answers[1].join(", ")}` : "";
  const mvp = result.phases[0];
  // Keep the model's concrete onboarding content when only its title differs.
  const openingFeature = opening && mvp.features.find(f => /^pembukaan pertama:/i.test(f.title));
  if (openingFeature && openingFeature.title !== opening) { openingFeature.title = opening; normalized.push("Judul pembukaan pertama"); }
  for (const title of [...mandatory, ...(opening ? [opening] : [])]) {
    if (!mvp.features.some(f => f.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
      const missing = makeFeature(title, "pending");
      mvp.features = [missing, ...mvp.features].slice(0, 4);
      normalized.push(`MVP: ${title}`);
    }
  }
  // Put all requested features first; avoid evicting an earlier required feature while filling the fourth slot.
  if (mandatory.length || opening) {
    const titles = [...mandatory, ...(opening ? [opening] : [])];
    const required = titles.map(title => mvp.features.find(f => f.title.toLocaleLowerCase() === title.toLocaleLowerCase()) || makeFeature(title, "pending"));
    mvp.features = [...required, ...mvp.features.filter(f => !titles.some(t => t.toLocaleLowerCase() === f.title.toLocaleLowerCase()))].slice(0, 4);
  }
  result.phases[0].title = "Fase 1: MVP";
  result.phases = result.phases.map((p, pi) => ({ ...p, features: p.features.map((f, fi) => ({ ...f, id: `p${pi + 1}-f${fi + 1}`, subfeatures: f.subfeatures.map((t, ti) => ({ ...t, id: `p${pi + 1}-f${fi + 1}-t${ti + 1}` })) })) }));
  if (needsSharedScope(draft) && !result.dataModel[0].fields.some(f => f.startsWith("household_id"))) { result.dataModel[0].fields = ["household_id: string", ...result.dataModel[0].fields].slice(0, 20); normalized.push("household_id"); }
  if (hasMonetizationIntent(draft)) {
    result.permissionMatrix = [...permissionMatrixFor(draft), ...result.permissionMatrix.filter(item => !/^(free|pro)$/i.test(item.role))].slice(0, 20);
  }
  result.systemAcceptance = systemAcceptanceFor(draft);
  result.unresolvedDecisions = [...new Set([...unresolvedFromDraft(draft), ...result.unresolvedDecisions])].slice(0, 20);
  result.designSystem = DESIGN_STANDARD;
  result.technicalArchitecture = technicalArchitectureFor(draft, stack);
  return { prd: prdSchema.parse(result), normalized: [...new Set(normalized)] };
}

export function assessPRD(plan: GeneratedPlan): { readyForTechnicalReview: boolean; issues: string[] } {
  const p = prdSchema.parse(plan.prd);
  const issues: string[] = [];
  if (plan.source === "example") issues.push("Mode contoh lokal perlu peninjauan manusia sebelum menjadi spesifikasi implementasi.");
  if (!p.userFlows.length) issues.push("User Flow belum didefinisikan.");
  if (p.unresolvedDecisions.length) issues.push(`${p.unresolvedDecisions.length} keputusan masih terbuka.`);
  if (plan.normalized.some(value => ["phases", "userFlows", "permissionMatrix"].includes(value))) issues.push("Bagian inti pernah diganti dengan contoh lokal; tinjau isi dan keterkaitannya.");
  const vague = /<[a-z][a-z _:/-]{2,80}>|belum (?:dirinci|ditentukan)|bangun alur utama|pengguna dapat menjalankan kebutuhan/i;
  if (p.phases.some(phase => phase.features.some(feature => feature.acceptance.some(item => vague.test(`${item.precondition} ${item.action} ${item.expected}`))))) issues.push("Sebagian kriteria penerimaan belum memiliki kondisi, tindakan, dan hasil yang cukup spesifik.");
  if (hasMonetizationIntent(plan.draft)) {
    const extra = monetizationAnswers(plan.draft);
    if (!extra.entitlements.length || !extra.quota.length || !extra.paymentFailure.length) issues.push("Aturan hak Free/Pro, kuota, atau pembayaran gagal belum lengkap.");
    if (!p.permissionMatrix.some(row => /^free$/i.test(row.role) && !vague.test(row.rule)) || !p.permissionMatrix.some(row => /^pro$/i.test(row.role) && !vague.test(row.rule))) issues.push("Matriks izin Free dan Pro belum lengkap.");
    if (!p.systemAcceptance.some(item => /kuota/i.test(`${item.precondition} ${item.action} ${item.expected}`))) issues.push("Skenario batas kuota belum ada.");
  }
  if (usesMidtrans(plan.draft) && (!p.systemAcceptance.some(item => /dua kali|berulang|duplikat/i.test(`${item.action} ${item.expected}`)) || !p.technicalArchitecture.paymentNotifications.some(value => /idempoten/i.test(value)))) issues.push("Skenario notifikasi Midtrans berulang belum lengkap.");
  return { readyForTechnicalReview: issues.length === 0, issues };
}

export function exportMarkdown(plan: GeneratedPlan, tasks: Record<string, true> = {}) {
  const p = plan.prd;
  const design = p.designSystem ?? DESIGN_STANDARD;
  const architecture = p.technicalArchitecture ?? technicalArchitectureFor(plan.draft, plan.stack);
  const extra = monetizationAnswers(plan.draft);
  const quality = assessPRD(plan);
  const markdownCell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const answerFor = (index: number) => index < 5 ? plan.draft.answers[index] : [extra.entitlements, extra.quota, extra.paymentFailure][index - 5];
  const sections = [
    `# ${p.title}`, "", p.summary, "",
    `Sumber: ${plan.source === "ai" ? `DeepSeek (${plan.model})` : "Contoh lokal berbasis aturan"}`,
    `Dibuat: ${plan.generatedAt}`,
    ...(plan.normalized.length ? [`Normalisasi lokal: ${plan.normalized.join(", ")}`] : []),
    `Gerbang mutu: ${quality.readyForTechnicalReview ? "Siap untuk review teknis" : "Perlu perbaikan sebelum review teknis"}`,
    ...quality.issues.map(value => `- ${value}`),
    "", "## Pengguna", ...p.audience.map(v => `- ${v}`),
    "", "## Tujuan", ...p.goals.map(v => `- ${v}`),
    "", "## Di luar cakupan", ...p.outOfScope.map(v => `- ${v}`),
    "", "## Tech stack", ...Object.entries(plan.stack).map(([k, v]) => `- ${k}: ${v}`),
    ...(hasMonetizationIntent(plan.draft) ? ["", "## Aturan monetisasi", ...clarificationQuestions(plan.draft).slice(5).flatMap((question, offset) => ["", `### ${question}`, ...(answerFor(offset + 5).length ? answerFor(offset + 5).map(value => `- ${value}`) : ["- Belum ditentukan; putuskan sebelum implementasi."])])] : []),
    "", "## User Flow", ...p.userFlows.flatMap((flow, index) => ["", `### Alur ${index + 1}: ${flow.actor}`, `Pemicu: ${flow.trigger}`, ...flow.steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`), `Hasil berhasil: ${flow.success}`, `Jika gagal: ${flow.failure}`]),
    "", "## Matriks izin dan peran", ...(p.permissionMatrix.length ? ["| Peran | Kemampuan | Aturan |", "| --- | --- | --- |", ...p.permissionMatrix.map(row => `| ${markdownCell(row.role)} | ${markdownCell(row.capability)} | ${markdownCell(row.rule)} |`)] : ["Tidak ada paket atau peran khusus yang ditentukan."]),
    "", `## Sistem desain (${design.source})`, "", "### Warna", ...Object.entries(design.colors).map(([key, value]) => `- ${key}: ${value}`),
    "", "### Tipografi", ...Object.entries(design.typography).map(([key, value]) => `- ${key}: ${value}`),
    "", "### Spacing dan radius", `- ${design.spacing}`, `- ${design.radius}`,
    "", "### State antarmuka", ...design.states.map(value => `- ${value}`),
    "", "### Responsivitas ponsel", ...design.responsive.map(value => `- ${value}`),
    "", "## Arsitektur teknis", "", "### Route server/API", ...(architecture.serverRoutes.length ? architecture.serverRoutes.map(value => `- ${value}`) : ["- Tidak diperlukan oleh stack yang dipilih."]),
    "", "### Identitas dan akses data", ...(architecture.identityAndData.length ? architecture.identityAndData.map(value => `- ${value}`) : ["- Tentukan mekanisme autentikasi dan otorisasi sesuai stack."]),
    "", "## Aturan akses data Firestore", ...(plan.stack.database === "Firestore" ? architecture.identityAndData.map(value => `- ${value}`) : ["Tidak digunakan oleh stack yang dipilih."]),
    ...(architecture.paymentNotifications.length ? ["", "## Midtrans Snap dan notifikasi pembayaran", ...architecture.paymentNotifications.map(value => `- ${value}`)] : []),
    "", "## Kriteria penerimaan sistem", ...(p.systemAcceptance.length ? p.systemAcceptance.flatMap((item, index) => [`${index + 1}. **Kondisi awal:** ${item.precondition}`, `   **Tindakan:** ${item.action}`, `   **Hasil teramati:** ${item.expected}`]) : ["Tidak ada skenario lintas fitur tambahan."]),
    ...p.phases.flatMap(phase => ["", `## ${phase.title}`, phase.goal, ...phase.features.flatMap(f => ["", `### ${f.title}`, f.description, ...f.subfeatures.map(t => `- [${tasks[t.id] ? "x" : " "}] ${t.title}`), "", "Kriteria penerimaan:", ...f.acceptance.flatMap((item, index) => [`${index + 1}. **Kondisi awal:** ${item.precondition}`, `   **Tindakan:** ${item.action}`, `   **Hasil teramati:** ${item.expected}`])])]),
    "", "## Model data", ...p.dataModel.flatMap(e => ["", `### ${e.name}`, ...e.fields.map(f => `- ${f}`)]),
    "", "## Risiko", ...p.risks.map(r => `- ${r.risk}\n  Mitigasi: ${r.mitigation}`),
    "", "## Asumsi", ...p.assumptions.map(a => `- ${a}`),
    "", "## Keputusan terbuka (Unresolved Decisions)", ...(p.unresolvedDecisions.length ? p.unresolvedDecisions.map(value => `- ${value}`) : ["Tidak ada keputusan terbuka yang teridentifikasi oleh generator; tetap tinjau bersama pemilik produk."]),
    "", "## Lampiran: ide awal", plan.draft.idea,
    ...clarificationQuestions(plan.draft).flatMap((question, index) => ["", `### ${question}`, answerFor(index).join("; ") || "Dilewati"]), "",
  ];
  return sections.join("\n");
}
