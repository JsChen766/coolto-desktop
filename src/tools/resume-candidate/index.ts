import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import type { ResumeCandidatePreparer } from "../../resume/workspace/candidate-preparer.js";
import { createPatchResumeCandidateTool } from "./patch-candidate.js";
import { createPrepareResumeCandidateTool } from "./prepare-candidate.js";

export function createResumeCandidateTools(
  preparer: ResumeCandidatePreparer,
  patcher: ResumeCandidatePatcher,
): AgentTool[] {
  return [
    createPrepareResumeCandidateTool(preparer),
    createPatchResumeCandidateTool(patcher),
  ];
}
