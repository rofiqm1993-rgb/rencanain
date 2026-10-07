import type { Project } from "./prd";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Firestore does not support arrays directly containing other arrays.
export function encodeProjectForFirestore(project: Project) {
  return JSON.parse(JSON.stringify({
    ...project,
    draft: {
      ...project.draft,
      answers: project.draft.answers.map(values => ({ values })),
    },
  }));
}

// Preserve legacy array rows and leave malformed rows for schema validation.
export function decodeProjectFromFirestore(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.draft) || !Array.isArray(value.draft.answers)) return value;
  return {
    ...value,
    draft: {
      ...value.draft,
      answers: value.draft.answers.map(row =>
        isRecord(row) && Array.isArray(row.values) ? row.values : row
      ),
    },
  };
}
