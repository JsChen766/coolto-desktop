import type { ResumeSectionItem, ResumeStructure } from "../types.js";

/**
 * Locates a section item by stable ID across all resume sections.
 */
export function findItemInStructure(
  structure: ResumeStructure,
  itemId: string,
): ResumeSectionItem | undefined {
  const id = itemId.trim();
  for (const section of structure.sections) {
    const item = section.items.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return undefined;
}
