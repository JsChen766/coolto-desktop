import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeQualityIssue, ResumeRepairTarget } from "./types.js";

export function buildRepairTargets(
  issues: readonly ResumeQualityIssue[],
  compileResult: ResumeCompileResult,
): ResumeRepairTarget[] {
  return [...issues]
    .filter((issue) => issue.repairable)
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 2)
    .map((issue, index) => ({
      targetId: targetId(issue, index),
      type: issue.code,
      priority: issue.priority,
      bulletIds: [...(issue.bulletIds ?? [])],
      ...(issue.itemId ? { itemId: issue.itemId } : {}),
      ...(issue.requirementId ? { requirementId: issue.requirementId } : {}),
      instruction: repairInstruction(issue, compileResult),
    }));
}

function targetId(issue: ResumeQualityIssue, index: number): string {
  return [
    issue.code,
    issue.bulletIds?.join("-"),
    issue.itemId,
    issue.requirementId,
    index,
  ]
    .filter((value) => value !== undefined && value !== "")
    .join(":");
}

function repairInstruction(
  issue: ResumeQualityIssue,
  compileResult: ResumeCompileResult,
): string {
  if (issue.code === "near_duplicate_bullet") {
    return "Remove the lower-value duplicate or replace it with unused evidence that adds distinct information.";
  }
  if (issue.code === "uncovered_must_have_requirement") {
    return `Add or replace one bullet using availableEvidence for requirement ${issue.requirementId}; do not invent support.`;
  }
  if (issue.code === "layout_violation") {
    const violation = compileResult.violations.find(
      (candidate) => candidate.code === issue.violationCode,
    );
    return `Repair only ${violation?.bulletId ?? issue.violationCode ?? "the measured layout failure"} using the exact pixel diagnostic.`;
  }
  if (issue.code === "missing_experience_content") {
    return "Add one distinct evidence-bound bullet to the named source experience item.";
  }
  return "Replace only the cited bullet with wording supported by the same source evidence and responsibility level.";
}
