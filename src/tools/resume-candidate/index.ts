import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import type { ResumeCandidatePreparer } from "../../resume/workspace/candidate-preparer.js";
import type { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import type { ResumeAlternativeRepairer } from "../../resume/quality/alternative-repairer.js";
import { createPatchResumeCandidateTool } from "./patch-candidate.js";
import { createPrepareResumeCandidateTool } from "./prepare-candidate.js";
import { createReviewResumeCandidateTool } from "./review-candidate.js";

export function createResumeCandidateTools(
  preparer: ResumeCandidatePreparer,
  patcher: ResumeCandidatePatcher,
  reviewer: ResumeCandidateReviewer,
  repairer: ResumeAlternativeRepairer,
): AgentTool[] {
  return [
    createPrepareResumeCandidateTool(preparer, reviewer),
    createPatchResumeCandidateTool(patcher, repairer, reviewer),
    createReviewResumeCandidateTool(reviewer),
  ];
}
