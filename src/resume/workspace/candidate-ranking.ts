import type { ResumeCompileResult } from "../compiler-types.js";
import { unwrittenExperienceItemIds } from "./candidate-content.js";
import type { ResumeCandidateSnapshot } from "./types.js";

export function isBetterCandidate(
  candidate: ResumeCandidateSnapshot,
  currentBest: ResumeCandidateSnapshot,
): boolean {
  return compareVectors(
    rankingVector(candidate),
    rankingVector(currentBest),
  ) < 0;
}

function rankingVector(snapshot: ResumeCandidateSnapshot): number[] {
  const result: ResumeCompileResult = snapshot.compileResult;
  const violationCount = (code: string) =>
    result.violations.filter((violation) => violation.code === code).length;
  const critical =
    violationCount("profile_mismatch") + violationCount("font_unavailable");
  const pageFailures =
    violationCount("multiple_pages") + violationCount("page_overflow");
  const tailFailures = violationCount("bullet_tail_too_short");
  const targetDistance = Math.abs(
    result.usageRatio - result.effectiveTargetBand.target,
  );
  return [
    unwrittenExperienceItemIds(snapshot.structure).length,
    result.qualified ? 0 : 1,
    critical,
    pageFailures,
    result.overflowPx,
    tailFailures,
    violationCount("page_underfilled"),
    targetDistance,
    result.violations.length,
  ];
}

function compareVectors(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
