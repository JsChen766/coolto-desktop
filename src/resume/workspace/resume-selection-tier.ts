import type { ResumeItemTier } from "./types.js";

interface SelectionInput {
  experienceId: string;
  tier?: string | null;
}

interface SelectionStructure {
  sections: Array<{
    type: string;
    items: Array<{ id: string; source_experience_id: string | null }>;
  }>;
}

export function validateTierInputs(
  structure: SelectionStructure,
  inputs: readonly SelectionInput[],
): string | undefined {
  const tieredExperienceIds = new Set(
    structure.sections.flatMap((section) =>
      section.type === "education" || section.type === "skills"
        ? []
        : section.items.flatMap((item) =>
            item.source_experience_id ? [item.source_experience_id] : [],
          ),
    ),
  );
  for (const input of inputs) {
    if (tieredExperienceIds.has(input.experienceId) && !isResumeTier(input.tier)) {
      return `来源 ${input.experienceId} 必须声明 main、secondary 或 utility；纯语言、工具、证书行使用 utility`;
    }
  }
  return undefined;
}

export function tiersForStructure(
  structure: SelectionStructure,
  inputs: readonly SelectionInput[],
): Record<string, ResumeItemTier> {
  const byExperience = new Map(
    inputs.flatMap((input) =>
      isResumeTier(input.tier)
        ? [[input.experienceId, input.tier] as const]
        : [],
    ),
  );
  return Object.fromEntries(
    structure.sections.flatMap((section) =>
      section.type === "education" || section.type === "skills"
        ? []
        : section.items.flatMap((item) => {
            const value = item.source_experience_id
              ? byExperience.get(item.source_experience_id)
              : undefined;
            return value ? [[item.id, value] as const] : [];
          }),
    ),
  );
}

function isResumeTier(value: string | null | undefined): value is ResumeItemTier {
  return value === "main" || value === "secondary" || value === "utility";
}
