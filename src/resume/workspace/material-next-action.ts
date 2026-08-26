import { criticalSkillMaterialRequest } from "./critical-skill-gate.js";
import { normalizeResumeMaterialRequest } from "./material-request.js";
import type { ResumeWorkspace } from "./types.js";

export type ResumeMaterialNextAction =
  | {
    mode: "request_more_material";
    requestId?: string;
    question?: string;
    targetExperienceId?: string;
  }
  | {
    mode: "stop_insufficient_material";
    requestId: string;
    reason: string;
  };

export function resumeMaterialNextAction(
  workspace: ResumeWorkspace,
): ResumeMaterialNextAction | undefined {
  if (workspace.status === "needs_user_decision" && workspace.materialRequest) {
    const request = normalizeResumeMaterialRequest(
      workspace.candidateId,
      workspace.materialRequest,
    );
    if (request.status === "declined") {
      return {
        mode: "stop_insufficient_material",
        requestId: request.id,
        reason: request.reason,
      };
    }
    return {
      mode: "request_more_material",
      requestId: request.id,
      question: request.question,
      ...(request.targetExperienceId
        ? { targetExperienceId: request.targetExperienceId }
        : {}),
    };
  }
  const criticalRequest = criticalSkillMaterialRequest(workspace);
  if (criticalRequest) {
    return { mode: "request_more_material", question: criticalRequest.question };
  }
  return workspace.status === "needs_user_decision"
    ? { mode: "request_more_material" }
    : undefined;
}
