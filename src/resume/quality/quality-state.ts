import type { ResumeStructure } from "../types.js";
import type { ResumeWorkspaceStatus } from "../workspace/types.js";
import type { ResumeQualityReport } from "./types.js";

export function statusAfterQualityReview(
  report: ResumeQualityReport,
  repairRound: number,
): ResumeWorkspaceStatus {
  if (report.passed) return "ready_for_approval";
  if (report.blocking || repairRound >= 3) return "needs_user_decision";
  return "needs_revision";
}

export function applyQualityMetadata(
  source: ResumeStructure,
  report: ResumeQualityReport,
  status: ResumeWorkspaceStatus,
): ResumeStructure {
  return {
    ...structuredClone(source),
    quality_status:
      status === "ready_for_approval"
        ? "passed"
        : status === "needs_user_decision"
          ? "needs_user_decision"
          : "failed",
    quality_issues: report.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
    })),
  };
}
