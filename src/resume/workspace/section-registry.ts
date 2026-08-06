import { dedupeResumeSkills } from "../contracts/section-contract.js";
import type { ResumeSourceExperienceSnapshot } from "../source-types.js";
import type { ResumeSection } from "../types.js";
import type { ResumeCandidateLanguage } from "./types.js";

interface SectionDefinition {
  id: string;
  type: ResumeSection["type"];
  heading: string;
  experiences: ResumeSourceExperienceSnapshot[];
}

const headings = {
  "zh-CN": {
    education: "教育经历", experience: "工作经历", project: "项目经历",
    volunteer: "志愿与社团", other: "其他经历", skills: "专业技能",
  },
  "en-US": {
    education: "EDUCATION", experience: "WORK EXPERIENCE", project: "PROJECTS",
    volunteer: "VOLUNTEERING & ACTIVITIES", other: "ADDITIONAL EXPERIENCE", skills: "SKILLS",
  },
} as const;

/**
 * Declarative resume grouping. New valid custom keys use the generic `other`
 * branch; no category enum or renderer switch needs to grow for them.
 */
export function resumeSectionRegistry(
  experiences: readonly ResumeSourceExperienceSnapshot[],
  language: ResumeCandidateLanguage,
): SectionDefinition[] {
  const copy = headings[language];
  const core: SectionDefinition[] = [
    group("section-education", "education", copy.education, experiences, (x) => x.category === "education"),
    group("section-experience", "experience", copy.experience, experiences, (x) => x.category === "work"),
    group("section-project", "project", copy.project, experiences, (x) => x.category === "project"),
  ].filter(hasItems);
  const additional = new Map<string, SectionDefinition>();
  for (const experience of experiences) {
    const definition = additionalDefinition(experience, copy);
    if (!definition) continue;
    const current = additional.get(definition.id);
    if (current) current.experiences.push(experience);
    else additional.set(definition.id, { ...definition, experiences: [experience] });
  }
  const custom = [...additional.values()].sort((left, right) =>
    firstSeen(left).localeCompare(firstSeen(right)),
  );
  const explicitSkills = custom.filter((section) => section.type === "skills");
  return [
    ...core,
    ...custom.filter((section) => section.type !== "skills"),
    // Skills is a fixed section: an explicit skills experience wins; when
    // none exists the caller synthesizes items from collectSkillEvidence.
    ...(explicitSkills.length
      ? explicitSkills
      : [{ id: "section-skills", type: "skills" as const, heading: copy.skills, experiences: [] }]),
  ];
}

function firstSeen(section: SectionDefinition): string {
  return section.experiences
    .map((experience) => experience.createdAt ?? "\uffff")
    .sort()[0] ?? "";
}

export function collectSkillHints(
  experiences: readonly ResumeSourceExperienceSnapshot[],
): string[] {
  return dedupeResumeSkills(experiences.flatMap((experience) =>
    experience.resumeSectionKey === "skills" || experience.tags.some((tag) =>
      includesNormalized(experience.content, tag),
    ) ? experience.tags : [],
  ));
}

export interface SkillEvidence {
  skill: string;
  experienceId: string;
}

/**
 * Skills with a traceable source: a tag counts only when it actually appears
 * in the experience content, so the skill bullet can bind to that sentence.
 */
export function collectSkillEvidence(
  experiences: readonly ResumeSourceExperienceSnapshot[],
): SkillEvidence[] {
  const seen = new Set<string>();
  const result: SkillEvidence[] = [];
  for (const experience of experiences) {
    for (const tag of experience.tags) {
      if (!includesNormalized(experience.content, tag)) continue;
      const key = `${experience.id}:${tag.trim().toLocaleLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ skill: tag, experienceId: experience.id });
    }
  }
  return result;
}

function group(
  id: string, type: ResumeSection["type"], heading: string,
  experiences: readonly ResumeSourceExperienceSnapshot[],
  matches: (experience: ResumeSourceExperienceSnapshot) => boolean,
): SectionDefinition {
  return { id, type, heading, experiences: experiences.filter(matches) };
}

function hasItems(section: SectionDefinition): boolean {
  return section.experiences.length > 0;
}

function additionalDefinition(
  experience: ResumeSourceExperienceSnapshot,
  copy: (typeof headings)[ResumeCandidateLanguage],
): SectionDefinition | undefined {
  if (experience.category === "volunteer") {
    return { id: "section-volunteer", type: "other", heading: copy.volunteer, experiences: [] };
  }
  if (experience.category !== "other") return undefined;
  if (experience.resumeSectionKey === "skills") {
    return { id: "section-skills", type: "skills", heading: copy.skills, experiences: [] };
  }
  if (experience.resumeSectionKey && experience.resumeSectionLabel) {
    return {
      id: `section-custom-${experience.resumeSectionKey}`,
      type: "other", heading: experience.resumeSectionLabel, experiences: [],
    };
  }
  return { id: "section-other", type: "other", heading: copy.other, experiences: [] };
}

function includesNormalized(content: string, tag: string): boolean {
  const normalizedTag = tag.trim().toLocaleLowerCase();
  return Boolean(normalizedTag) && content.toLocaleLowerCase().includes(normalizedTag);
}
