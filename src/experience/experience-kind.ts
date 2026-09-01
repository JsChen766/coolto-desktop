import type { ExperienceCategory, ExperienceSummary } from "../api/types.js";

export type ExperienceKind = ExperienceCategory | "skills";

export const EXPERIENCE_KIND_LABELS: Record<ExperienceKind, string> = {
  work: "工作",
  project: "项目",
  education: "教育",
  volunteer: "志愿",
  other: "其他",
  skills: "专业技能",
};

export function experienceKind(
  value: Pick<ExperienceSummary, "category" | "resumeSectionKey">,
): ExperienceKind {
  return isSkillsExperience(value) ? "skills" : value.category;
}

export function isSkillsExperience(
  value: Pick<ExperienceSummary, "category" | "resumeSectionKey">,
): boolean {
  return value.category === "other" && value.resumeSectionKey === "skills";
}

export function fieldsForExperienceKind(kind: ExperienceKind) {
  return kind === "skills"
    ? { category: "other" as const, resumeSectionKey: "skills", resumeSectionLabel: "专业技能" }
    : { category: kind, resumeSectionKey: null, resumeSectionLabel: null };
}
