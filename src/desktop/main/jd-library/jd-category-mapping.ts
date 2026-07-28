import {
  JD_REQUIREMENT_V2_CATEGORIES,
  type JdRequirementV2Category,
} from "../../../api/types.js";

const LEGACY_CATEGORY_MAP: Readonly<Record<string, string>> = {
  qualification: "qualification",
  experience: "qualification",
  education: "qualification",
  language: "qualification",
  responsibility: "responsibility",
  responsibilities: "responsibility",
  skill: "technology",
  technical: "technology",
  technology: "technology",
  domain: "domain",
  industry: "domain",
  soft_skill: "soft_skill",
  "soft-skill": "soft_skill",
  softskill: "soft_skill",
  other: "other",
};

export function canonicalRequirementCategory(
  v2: JdRequirementV2Category | undefined,
  legacy: string,
): string {
  if (v2) return v2;
  return LEGACY_CATEGORY_MAP[legacy.trim().toLowerCase()] ?? "other";
}

export function isV2RequirementCategory(
  value: string,
): value is JdRequirementV2Category {
  return (JD_REQUIREMENT_V2_CATEGORIES as readonly string[]).includes(value);
}
