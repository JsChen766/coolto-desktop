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

export function compareCandidateSnapshots(
  left: ResumeCandidateSnapshot,
  right: ResumeCandidateSnapshot,
): number {
  return compareVectors(rankingVector(left), rankingVector(right));
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
  const qualityIssues = snapshot.qualityReport?.issues ?? [];
  const sourceQualityFailures = qualityIssues.filter((issue) =>
    [
      "near_duplicate_bullet",
      "unsupported_responsibility_claim",
      "unsupported_technology_claim",
      "missing_source_for_must_have_requirement",
    ].includes(issue.code),
  ).length;
  const uncoveredMustHave = qualityIssues.filter(
    (issue) => issue.code === "uncovered_must_have_requirement",
  ).length;
  return [
    unwrittenExperienceItemIds(snapshot.structure).length,
    sourceQualityFailures,
    critical,
    pageFailures,
    result.overflowPx,
    tailFailures,
    violationCount("page_underfilled"),
    uncoveredMustHave,
    result.qualified ? 0 : 1,
    targetDistance,
    -(snapshot.qualityReport?.score.overall ?? 0),
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
