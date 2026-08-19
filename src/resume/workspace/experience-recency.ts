import type { ResumeSourceExperienceSnapshot } from "../source-types.js";

const CURRENT_END_DATE = /^(?:present|current|至今|现在)$/iu;

/** Reverse chronology for dated work and project items. */
export function compareResumeExperienceRecency(
  left: Readonly<ResumeSourceExperienceSnapshot>,
  right: Readonly<ResumeSourceExperienceSnapshot>,
): number {
  return compareNumber(endRank(right.endDate), endRank(left.endDate)) ||
    compareNumber(startRank(right.startDate), startRank(left.startDate)) ||
    (right.createdAt ?? "").localeCompare(left.createdAt ?? "") ||
    left.id.localeCompare(right.id);
}

function endRank(value: string | null): number {
  if (CURRENT_END_DATE.test(value?.trim() ?? "")) return Number.POSITIVE_INFINITY;
  return dateRank(value, 31);
}

function startRank(value: string | null): number {
  return dateRank(value, 1);
}

function dateRank(value: string | null, defaultDay: number): number {
  const match = value?.trim().match(/^(\d{4})(?:[-./](\d{1,2}))?(?:[-./](\d{1,2}))?$/u);
  if (!match) return Number.NEGATIVE_INFINITY;
  return Number(match[1]) * 10_000 + Number(match[2] ?? 1) * 100 +
    Number(match[3] ?? defaultDay);
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
