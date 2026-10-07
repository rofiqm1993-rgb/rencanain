import { z } from "zod";
import { acceptanceCriterionSchema, normalizePRD, prdSchema } from "./prd";
import { hasMonetizationIntent, type ClarificationDraft } from "./clarification";
import type { TechStack } from "./tech-stack";
import { ServiceError } from "./server-store";
const feature = prdSchema.shape.phases.element.shape.features.element.extend({
  subfeatures: prdSchema.shape.phases.element.shape.features.element.shape.subfeatures.min(2).max(3),
  acceptance: z.array(acceptanceCriterionSchema).min(2).max(6),
});
const schema = prdSchema.extend({
  phases: z.array(prdSchema.shape.phases.element.extend({ features: z.array(feature).min(2).max(4) })).length(3),
  userFlows: prdSchema.shape.userFlows.removeDefault().min(1),
  permissionMatrix: prdSchema.shape.permissionMatrix.removeDefault(),
  unresolvedDecisions: prdSchema.shape.unresolvedDecisions.removeDefault(),
});
export function validateAI(value: unknown, draft: ClarificationDraft, stack: TechStack) {
  const parsed = schema.safeParse(value);
  const fail = () => { throw new ServiceError(502, "ai-quality", "PRD AI belum memenuhi struktur atau kebutuhan yang dipilih. Kuota tidak terpakai. Coba susun ulang; hasil sebelumnya tetap tersedia."); };
  if (!parsed.success) return fail();
  const prd = parsed.data;
  const opening = draft.answers[1].length ? `Pembukaan pertama: ${draft.answers[1].join(", ")}` : "Pembukaan pertama: akses aktivitas utama";
  if ([...draft.answers[2], opening].some(title => !prd.phases[0].features.some(f => f.title === title))) return fail();
  const contents = JSON.stringify({ title: prd.title, summary: prd.summary, phases: prd.phases, userFlows: prd.userFlows, dataModel: prd.dataModel, risks: prd.risks });
  if (/<[a-z][a-z _:/-]{2,80}>|bangun alur utama|pengguna dapat menjalankan kebutuhan|lorem ipsum|\bTODO\b|\bTBD\b/i.test(contents)) return fail();
  if (hasMonetizationIntent(draft) && ["free", "pro"].some(role => !prd.permissionMatrix.some(row => row.role.toLowerCase() === role))) return fail();
  // The model must supply domain content. Only deterministic IDs and the app's authoritative design/architecture are added locally.
  const result = normalizePRD(prd, draft, stack);
  result.prd.permissionMatrix = prd.permissionMatrix;
  if (result.normalized.some(item => ["title", "summary", "phases", "audience", "goals", "dataModel", "risks"].includes(item) || item.startsWith("MVP:"))) return fail();
  return result;
}
