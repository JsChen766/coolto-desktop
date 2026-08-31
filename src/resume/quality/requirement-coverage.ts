import type {
  BulletEvidenceBinding,
  ResumeSourceRequirementSnapshot,
  ResumeSourceSnapshot,
} from "../source-types.js";
import { resumeSourceRequirements } from "../source-strategy.js";

export function isMustHave(
  requirement: ResumeSourceRequirementSnapshot,
): boolean {
  return (
    requirement.v2Importance === "must_have" ||
    (requirement.v2Importance === null && requirement.importance === "high")
  );
}

export function calculateRequirementQuality(
  snapshot: ResumeSourceSnapshot,
  bindings: readonly BulletEvidenceBinding[],
) {
  const covered = new Set(
    bindings.flatMap((binding) => [...binding.matchedRequirementIds]),
  );
  const requirements = resumeSourceRequirements(snapshot);
  const mustHave = requirements.filter(isMustHave);
  const totalWeight = requirements.reduce((sum, requirement) => sum + weight(requirement), 0);
  const coveredWeight = requirements
    .filter((requirement) => covered.has(requirement.id))
    .reduce((sum, requirement) => sum + weight(requirement), 0);
  return {
    coveredIds: [...covered],
    weightedCoverage: ratio(coveredWeight, totalWeight),
    mustHaveCoverage: ratio(
      mustHave.filter((requirement) => covered.has(requirement.id)).length,
      mustHave.length,
    ),
    uncoveredMustHave: mustHave.filter((requirement) => !covered.has(requirement.id)),
  };
}

export function sourceSupportsRequirement(
  snapshot: ResumeSourceSnapshot,
  requirement: ResumeSourceRequirementSnapshot,
): boolean {
  return snapshot.experiences.some((experience) => {
    return textSupportsRequirement(
      requirement,
      `${experience.content} ${experience.tags.join(" ")}`,
    );
  });
}

export function textSupportsRequirement(
  requirement: ResumeSourceRequirementSnapshot,
  text: string,
): boolean {
  const haystack = text.toLocaleLowerCase();
  return requirementTerms(requirement).some((term) =>
    haystack.includes(term) || equivalentTerms(term).some((equivalent) =>
      haystack.includes(equivalent)
    )
  );
}

export function matchedRequirementIdsForText(
  snapshot: ResumeSourceSnapshot,
  text: string,
): string[] {
  const haystack = text.toLocaleLowerCase();
  return resumeSourceRequirements(snapshot)
    .filter((requirement) =>
      requirementTerms(requirement).some((term) =>
        haystack.includes(term) || equivalentTerms(term).some((equivalent) =>
          haystack.includes(equivalent)
        )
      ),
    )
    .map((requirement) => requirement.id);
}

const EQUIVALENT_TERM_GROUPS = [
  ["金融建模", "财务建模", "财务模型", "金融模型", "financial modeling", "financial model"],
  ["办公常用工具", "办公工具", "microsoft office", "office", "excel", "word", "powerpoint", "powerbi", "ppt"],
] as const;

function equivalentTerms(term: string): readonly string[] {
  return EQUIVALENT_TERM_GROUPS.find((group) =>
    group.some((anchor) => term.includes(anchor))
  ) ?? [];
}

function requirementTerms(requirement: ResumeSourceRequirementSnapshot): string[] {
  const explicit = requirement.keywords
    .map((keyword) => keyword.trim().toLocaleLowerCase())
    .filter((keyword) => keyword.length >= 2);
  if (explicit.length) return explicit;
  return requirement.text
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .filter((term) => term.length >= 2);
}

function weight(requirement: ResumeSourceRequirementSnapshot): number {
  if (requirement.weight !== null) return Math.max(0, requirement.weight);
  return requirement.importance === "high" ? 1 : requirement.importance === "medium" ? 0.6 : 0.3;
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 1;
}
