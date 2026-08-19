import type { ResumeSectionType } from "../types.js";
import type { ResumeItemTier } from "./types.js";

export function minimumResumeBulletCount(input: {
  sectionType: ResumeSectionType;
  itemId: string;
  tier?: ResumeItemTier;
}): number {
  if (input.sectionType === "education" ||
    input.itemId === "item-skills-synthetic") return 0;
  if (input.tier === "main") return 3;
  if (input.tier === "secondary") return 2;
  if (input.tier === "utility") return 1;
  return input.sectionType === "skills" ? 1 : 0;
}
