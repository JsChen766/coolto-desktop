import type {
  ExperienceCategory,
  ExperienceSummary,
} from "../api/types.js";
import { normalizeExperienceText } from "./text-highlight.js";
import { isSkillsExperience } from "./experience-kind.js";

export interface ExperienceTimelineFilters {
  query: string;
  category: ExperienceCategory | "";
  tags: string[];
}

export interface ExperienceTimelineGroup {
  key: string;
  label: string;
  items: ExperienceSummary[];
}

export function filterExperienceCatalog(
  catalog: readonly ExperienceSummary[],
  filters: ExperienceTimelineFilters,
): ExperienceSummary[] {
  const query = normalizeExperienceText(filters.query);
  const wantedTags = filters.tags.map(normalizeExperienceText).filter(Boolean);
  return catalog.filter((experience) => {
    if (filters.category && experience.category !== filters.category) return false;
    if (query && !searchText(experience).includes(query)) return false;
    const tags = new Set(experience.tags.map(normalizeExperienceText));
    return wantedTags.every((tag) => tags.has(tag));
  });
}

export function groupExperienceTimeline(
  experiences: readonly ExperienceSummary[],
): ExperienceTimelineGroup[] {
  const groups = new Map<string, ExperienceSummary[]>();
  for (const experience of [...experiences].sort(compareExperienceTimeline)) {
    const key = experienceGroupKey(experience);
    const items = groups.get(key) ?? [];
    items.push(experience);
    groups.set(key, items);
  }
  return [...groups].map(([key, items]) => ({
    key,
    label: key === "present" ? "至今"
      : key === "missing" ? "日期待补充" : key === "skills" ? "专业技能" : key,
    items,
  }));
}

export function experienceMatchContext(
  experience: ExperienceSummary,
  query: string,
): string | null {
  const wanted = normalizeExperienceText(query);
  if (!wanted) return null;
  if ([experience.title, experience.organization, experience.role]
    .some((value) => value && normalizeExperienceText(value).includes(wanted))) {
    return null;
  }
  if (experience.location && normalizeExperienceText(experience.location).includes(wanted)) {
    return `地点：${experience.location}`;
  }
  const tag = experience.tags.find(
    (value) => normalizeExperienceText(value).includes(wanted),
  );
  if (tag) return `标签：${tag}`;
  const line = experience.currentRevision?.content.split(/\r?\n/).find(
    (value) => normalizeExperienceText(value).includes(wanted),
  );
  return line ? shorten(line.trim(), 96) : null;
}

function searchText(experience: ExperienceSummary): string {
  return [
    experience.title,
    experience.organization,
    experience.role,
    experience.location,
    ...experience.tags,
    experience.currentRevision?.content,
  ].filter((value): value is string => typeof value === "string")
    .map(normalizeExperienceText)
    .join(" ");
}

function experienceGroupKey(experience: ExperienceSummary): string {
  if (isSkillsExperience(experience)) return "skills";
  if (experience.endDate === "present") return "present";
  return experience.endDate?.slice(0, 4) || "missing";
}

function compareExperienceTimeline(
  left: ExperienceSummary,
  right: ExperienceSummary,
): number {
  if (isSkillsExperience(left) !== isSkillsExperience(right)) {
    return isSkillsExperience(left) ? 1 : -1;
  }
  return compareNumber(endRank(right.endDate), endRank(left.endDate))
    || compareNumber(startRank(right.startDate), startRank(left.startDate))
    || right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id);
}

function endRank(value: string | null): number {
  if (value === "present") return Number.POSITIVE_INFINITY;
  if (!value) return Number.NEGATIVE_INFINITY;
  const [year = 0, month = 1, day] = value.split("-").map(Number);
  const resolvedDay = day ?? new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Date.UTC(year, month - 1, resolvedDay);
}

function startRank(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const [year = 0, month = 1, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day ?? 1);
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
