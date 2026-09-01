import type { ExperienceCategory, ExperienceSummary } from "../api/types.js";
import { isSkillsExperience } from "./experience-kind.js";

export const EXPERIENCE_CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  work: "工作",
  project: "项目",
  education: "教育",
  volunteer: "志愿",
  other: "其他",
};

export const EXPERIENCE_SYNC_LABELS: Record<
  NonNullable<ExperienceSummary["syncStatus"]>,
  string
> = {
  clean: "已同步",
  pending: "待同步",
  conflict: "同步冲突",
  failed: "同步失败",
};

export function experienceSubtitle(experience: ExperienceSummary): string {
  return [experience.organization, experience.role].filter(Boolean).join(" · ");
}

export function experienceDateRange(experience: ExperienceSummary): string {
  if (isSkillsExperience(experience)) return "";
  const start = formatExperienceDate(experience.startDate);
  const end = formatExperienceDate(experience.endDate);
  if (!start && !end) return "日期待补充";
  if (!end) return start ? `${start} – 待补充` : "日期待补充";
  return start ? `${start} – ${end}` : end;
}

export function experienceCategoryLabel(experience: ExperienceSummary): string {
  return isSkillsExperience(experience)
    ? experience.resumeSectionLabel ?? "专业技能"
    : EXPERIENCE_CATEGORY_LABELS[experience.category];
}

export function formatExperienceDate(value: string | null): string {
  if (!value) return "";
  if (value === "present") return "至今";
  return value.replaceAll("-", ".");
}
