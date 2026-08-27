import type { ResumeStructure } from "../../resume/types.js";
import type { ResumeItemTier } from "../../resume/workspace/types.js";

export function assertUniqueExperienceIds(
  inputs: readonly { experienceId: string }[],
): void {
  const ids = inputs.map((input) => input.experienceId.trim());
  if (new Set(ids).size !== ids.length) {
    throw new Error("experiences 含重复 ID");
  }
}

export function sameRecord(
  left: Record<string, ResumeItemTier>,
  right: Record<string, ResumeItemTier>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeBaseItemTiers(
  structure: ResumeStructure,
  agentTiers: Record<string, ResumeItemTier>,
  baseTiers: Record<string, ResumeItemTier> | undefined,
): Record<string, ResumeItemTier> {
  if (!baseTiers) return agentTiers;
  const itemIds = new Set(structure.sections.flatMap((section) =>
    section.items.map((item) => item.id)
  ));
  return {
    ...agentTiers,
    ...Object.fromEntries(Object.entries(baseTiers).filter(([itemId]) =>
      itemIds.has(itemId)
    )),
  };
}

export function applyLocalizedPositions(
  structure: ResumeStructure,
  inputs: readonly { experienceId: string; localizedPosition?: string }[],
): void {
  const byExperience = new Map(inputs.flatMap((input) => {
    const value = input.localizedPosition?.trim();
    return value ? [[input.experienceId, value] as const] : [];
  }));
  const work = structure.sections.find((section) => section.type === "experience");
  for (const item of work?.items ?? []) {
    const translated = item.source_experience_id
      ? byExperience.get(item.source_experience_id)
      : undefined;
    if (translated) item.title = translated;
  }
}

export function sameFixedPresentation(
  left: ResumeStructure,
  right: ResumeStructure,
): boolean {
  return JSON.stringify(fixedPresentation(left)) ===
    JSON.stringify(fixedPresentation(right));
}

function fixedPresentation(structure: ResumeStructure) {
  return structure.sections.flatMap((section) => section.items.map((item) => [
    item.id,
    section.type === "experience" ? item.title : null,
    section.type === "education" ? item.raw_text : null,
  ]));
}
