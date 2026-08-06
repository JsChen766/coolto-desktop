import type { ResumeStructure } from "../types.js";

const BULLET_REQUIRED_SECTIONS = new Set(["experience", "project", "other", "skills"]);

export function unwrittenExperienceItemIds(
  structure: ResumeStructure,
): string[] {
  return structure.sections
    .filter((section) => BULLET_REQUIRED_SECTIONS.has(section.type))
    .flatMap((section) =>
      section.items
        .filter(
          (item) =>
            Boolean(item.source_experience_id) &&
            item.id !== "item-skills-synthetic" &&
            item.bullets.length === 0,
        )
        .map((item) => item.id),
    );
}

export function hasMinimumGeneratedContent(structure: ResumeStructure): boolean {
  return unwrittenExperienceItemIds(structure).length === 0;
}
