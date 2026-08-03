import type { ResumeStructure } from "../types.js";
import type { BulletEvidenceBinding } from "../source-types.js";

export interface SectionSpaceDegradation {
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
  removedSectionIds: string[];
}

/**
 * Space recovery never invents or trims facts: it removes whole optional
 * sections in a stable order and leaves education/work/project untouched.
 */
export function degradeAdditionalSections(
  structure: ResumeStructure,
  bindings: readonly BulletEvidenceBinding[],
): SectionSpaceDegradation {
  const optional = structure.sections
    .filter((section) => section.type === "skills" || section.type === "other")
    .sort((left, right) => optionalRank(left.type) - optionalRank(right.type));
  const removed = optional.map((section) => section.id);
  if (!removed.length) return { structure, bindings: [...bindings], removedSectionIds: [] };
  const removedItems = new Set(optional.flatMap((section) => section.items.map((item) => item.id)));
  const removedBulletIds = new Set(optional.flatMap((section) =>
    section.items.flatMap((item) => item.bullets.map((bullet) => bullet.id)),
  ));
  return {
    structure: {
      ...structure,
      sections: structure.sections.filter((section) => !removed.includes(section.id)),
    },
    bindings: bindings.filter((binding) => !removedBulletIds.has(binding.bulletId) &&
      !removedItems.has(`item-${binding.sourceExperienceId}`)),
    removedSectionIds: removed,
  };
}

function optionalRank(type: string): number {
  return type === "skills" ? 0 : 1;
}
