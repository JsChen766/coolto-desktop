import type { ResumeCompileResult } from "../compiler-types.js";
import { EvidenceLedger } from "../evidence-ledger.js";
import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../source-types.js";
import type { ResumeStructure } from "../types.js";
import { unwrittenExperienceItemIds } from "../workspace/candidate-content.js";
import { findUnsupportedClaims } from "./claim-support.js";
import { buildRepairTargets } from "./repair-planner.js";
import { protectedQualityScore } from "./protected-core.js";
import {
  calculateRequirementQuality,
  sourceSupportsRequirement,
} from "./requirement-coverage.js";
import { findNearDuplicatePairs } from "./text-similarity.js";
import type { ResumeQualityIssue, ResumeQualityReport } from "./types.js";

export class ResumeQualityEvaluator {
  public evaluate(
    snapshot: ResumeSourceSnapshot,
    structure: ResumeStructure,
    bindings: readonly BulletEvidenceBinding[],
    compileResult: ResumeCompileResult,
  ): ResumeQualityReport {
    replayEvidence(snapshot, bindings);
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets),
    );
    const duplicates = findNearDuplicatePairs(bullets);
    const requirementQuality = calculateRequirementQuality(snapshot, bindings);
    const issues: ResumeQualityIssue[] = [
      ...unboundAdditionalContent(structure),
      ...findUnsupportedClaims(snapshot, bindings),
      ...duplicates.map(({ bulletIds, similarity }) => ({
        code: "near_duplicate_bullet" as const,
        message: `Bullets ${bulletIds.join(" and ")} are near duplicates (${similarity}).`,
        repairable: true,
        priority: 1,
        bulletIds: [...bulletIds],
      })),
      ...requirementQuality.uncoveredMustHave.map((requirement) => {
        const supported = sourceSupportsRequirement(snapshot, requirement);
        return {
          code: supported
            ? ("uncovered_must_have_requirement" as const)
            : ("missing_source_for_must_have_requirement" as const),
          message: supported
            ? `Must-have requirement ${requirement.id} has source support but is not covered.`
            : `Must-have requirement ${requirement.id} has no support in the selected sources.`,
          repairable: supported,
          priority: 2,
          requirementId: requirement.id,
        };
      }),
      ...unwrittenExperienceItemIds(structure).map((itemId) => ({
        code: "missing_experience_content" as const,
        message: `Source-backed resume item ${itemId} has no bullet.`,
        repairable: true,
        priority: 2,
        itemId,
      })),
      ...compileResult.violations.map((violation) => ({
        code: "layout_violation" as const,
        message: violation.message,
        repairable: !["font_unavailable", "profile_mismatch"].includes(
          violation.code,
        ),
        priority: layoutPriority(violation.code),
        ...(violation.bulletId ? { bulletIds: [violation.bulletId] } : {}),
        violationCode: violation.code,
      })),
    ];
    const score = {
      weightedJdCoverage: requirementQuality.weightedCoverage,
      mustHaveCoverage: requirementQuality.mustHaveCoverage,
      evidenceSpecificity: specificity(bindings),
      informationDiversity: diversityScore(bullets.length, duplicates.length),
      overall: 0,
    };
    score.overall = protectedQualityScore(
      score.weightedJdCoverage,
      score.mustHaveCoverage,
      score.evidenceSpecificity,
      score.informationDiversity,
    );
    const repairTargets = buildRepairTargets(issues, compileResult);
    const targeted = new Set(repairTargets.flatMap((target) => target.bulletIds));
    return {
      passed: issues.length === 0,
      blocking: issues.some((issue) => !issue.repairable),
      issues,
      score,
      repairTargets,
      frozenBulletIds: bullets
        .map((bullet) => bullet.id)
        .filter((bulletId) => !targeted.has(bulletId)),
    };
  }
}

function unboundAdditionalContent(structure: ResumeStructure): ResumeQualityIssue[] {
  return structure.sections
    .filter((section) => section.type === "other" || section.type === "skills")
    .flatMap((section) => section.items)
    .filter((item) => Boolean(item.raw_text?.trim()))
    .map((item) => ({
      code: "unbound_additional_content" as const,
      message: `Additional item ${item.id} must use evidence-bound bullets, not raw text.`,
      repairable: false,
      priority: 1,
      itemId: item.id,
    }));
}

function replayEvidence(
  snapshot: ResumeSourceSnapshot,
  bindings: readonly BulletEvidenceBinding[],
): void {
  const ledger = new EvidenceLedger(snapshot);
  for (const binding of bindings) ledger.reserve(binding);
}

function specificity(bindings: readonly BulletEvidenceBinding[]): number {
  if (!bindings.length) return 0;
  const specific = bindings.filter((binding) =>
    binding.excerpts.some(
      (excerpt) => /\d/u.test(excerpt.sourceQuote) || excerpt.sourceQuote.length >= 24,
    ),
  ).length;
  return round(specific / bindings.length);
}

function diversityScore(bulletCount: number, duplicateCount: number): number {
  if (bulletCount < 2) return 1;
  const possiblePairs = (bulletCount * (bulletCount - 1)) / 2;
  return round(Math.max(0, 1 - duplicateCount / possiblePairs));
}

function layoutPriority(code: string): number {
  if (code === "bullet_tail_too_short") return 3;
  if (code === "page_overflow" || code === "multiple_pages") return 4;
  if (code === "page_underfilled") return 5;
  return 1;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
