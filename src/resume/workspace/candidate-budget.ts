import type { ResumeCompileResult } from "../compiler-types.js";
import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../source-types.js";
import { resumeSourceRequirements } from "../source-strategy.js";
import type { ResumeBudgetDiagnostic } from "./types.js";

export function calculateResumeBudget(
  result: ResumeCompileResult,
): ResumeBudgetDiagnostic {
  const { minimum, target } = result.effectiveTargetBand;
  const pxToMinimum = Math.max(
    0,
    result.availableHeightPx * minimum - result.usedHeightPx,
  );
  const pxToTarget = Math.max(
    0,
    result.availableHeightPx * target - result.usedHeightPx,
  );
  const pxBeforeOverflow = Math.max(
    0,
    result.availableHeightPx - result.usedHeightPx,
  );
  return {
    usedHeightPx: result.usedHeightPx,
    availableHeightPx: result.availableHeightPx,
    usageRatio: result.usageRatio,
    pxToMinimum: round(pxToMinimum),
    pxToTarget: round(pxToTarget),
    pxBeforeOverflow: round(pxBeforeOverflow),
    bodyLineHeightPx: result.bodyLineHeightPx,
    estimatedBodyLinesRemaining:
      result.bodyLineHeightPx > 0
        ? round(pxBeforeOverflow / result.bodyLineHeightPx)
        : 0,
  };
}

export function requirementCoverage(
  snapshot: ResumeSourceSnapshot,
  bindings: readonly BulletEvidenceBinding[],
): { covered: string[]; uncovered: string[] } {
  const coveredSet = new Set(
    bindings.flatMap((binding) => [...binding.matchedRequirementIds]),
  );
  const all = resumeSourceRequirements(snapshot).map((requirement) => requirement.id);
  return {
    covered: all.filter((id) => coveredSet.has(id)),
    uncovered: all.filter((id) => !coveredSet.has(id)),
  };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
