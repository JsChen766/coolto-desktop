import type { ExperienceSummary } from "../../../../api/types.js";

export interface ExperienceImportFocus {
  conversationId: string;
  proposalId: string;
  experienceIds: string[];
}

export function uniqueExperienceIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export function mergeFocusedExperiences(
  catalog: readonly ExperienceSummary[],
  focused: readonly ExperienceSummary[],
): ExperienceSummary[] {
  const merged = new Map(catalog.map((item) => [item.id, item]));
  for (const item of focused) merged.set(item.id, item);
  return [...merged.values()];
}

export function nextFocusedExperienceId(
  ids: readonly string[],
  currentId: string | undefined,
  direction: -1 | 1,
): string | undefined {
  if (!ids.length) return undefined;
  const current = currentId ? ids.indexOf(currentId) : -1;
  const origin = current >= 0 ? current : direction > 0 ? -1 : 0;
  return ids[(origin + direction + ids.length) % ids.length];
}
