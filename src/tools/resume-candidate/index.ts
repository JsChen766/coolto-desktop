import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import type { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import type { ResumeAlternativeRepairer } from "../../resume/quality/alternative-repairer.js";
import { createPatchResumeCandidateTool } from "./patch-candidate.js";

/**
 * The single remaining candidate mutation tool: stable-ID incremental patch
 * during generation and bounded alternativeTargets repair after quality
 * review. The standalone preparer and reviewer tools were merged into the
 * agent-orchestrated flow (prepare_resume_draft / write_bullet /
 * inspect_resume_draft).
 */
export function createResumePatchTools(
  patcher: ResumeCandidatePatcher,
  reviewer: ResumeCandidateReviewer,
  repairer: ResumeAlternativeRepairer,
): AgentTool[] {
  return [createPatchResumeCandidateTool(patcher, repairer, reviewer)];
}
