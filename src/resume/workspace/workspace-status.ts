import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeStructure } from "../types.js";
import { hasMinimumGeneratedContent } from "./candidate-content.js";
import type { ResumeWorkspaceStatus } from "./types.js";

export function deriveWorkspaceStatus(
  result: ResumeCompileResult,
  structure: ResumeStructure,
): ResumeWorkspaceStatus {
  if (result.qualified && hasMinimumGeneratedContent(structure)) {
    return "layout_qualified";
  }
  const nonWritingViolations = result.violations.filter(
    (violation) => violation.code !== "page_underfilled",
  );
  return nonWritingViolations.length ? "needs_revision" : "writing";
}
