import type { ResumeSourceExperienceSnapshot } from "./source-types.js";

const CURRENT_END_DATE = /^(?:present|current|至今|现在)$/iu;

/** Education is mandatory and chronological; other source ordering stays stable by ID. */
export function orderResumeSourceExperiences(
  experiences: readonly ResumeSourceExperienceSnapshot[],
): ResumeSourceExperienceSnapshot[] {
  return [...experiences].sort((left, right) => {
    const leftEducation = left.category === "education";
    const rightEducation = right.category === "education";
    if (leftEducation !== rightEducation) return leftEducation ? -1 : 1;
    if (leftEducation && rightEducation) return compareEducation(left, right);
    return left.id.localeCompare(right.id);
  });
}

export function compareEducation(
  left: ResumeSourceExperienceSnapshot,
  right: ResumeSourceExperienceSnapshot,
): number {
  const currentDifference = Number(isCurrent(right.endDate)) - Number(isCurrent(left.endDate));
  if (currentDifference) return currentDifference;
  return compareDateDescending(left.endDate, right.endDate)
    || compareDateDescending(left.startDate, right.startDate)
    || left.id.localeCompare(right.id);
}

function isCurrent(value: string | null): boolean {
  return CURRENT_END_DATE.test(value?.trim() ?? "");
}

function compareDateDescending(left: string | null, right: string | null): number {
  return sortableDate(right) - sortableDate(left);
}

function sortableDate(value: string | null): number {
  const match = value?.trim().match(/^(\d{4})(?:[-./](\d{1,2}))?(?:[-./](\d{1,2}))?$/u);
  if (!match) return 0;
  return Number(match[1]) * 10_000 + Number(match[2] ?? 0) * 100 + Number(match[3] ?? 0);
}
