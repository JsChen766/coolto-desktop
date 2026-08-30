import { followUpMaterialQuestion } from "./material-question.js";
import { createResumeMaterialRequest } from "./material-request.js";
import { supplementalIntegrationTargets } from
  "./supplemental-integration-targets.js";
import type { ResumeWorkspace } from "./types.js";

/** Pauses once after newly supplied facts have been integrated into the draft. */
export function applyMaterialFollowUpGate(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  const pending = workspace.materialFollowUpPending;
  if (!pending || supplementalIntegrationTargets(workspace).length) {
    return workspace;
  }
  if (workspace.status === "needs_user_decision" && workspace.materialRequest) {
    return workspace;
  }
  const updated: ResumeWorkspace = {
    ...workspace,
    status: "needs_user_decision",
    materialRequest: createResumeMaterialRequest(workspace, {
      kind: pending.sourceRequestKind,
      reason: "用户本轮补充事实已写入简历，等待确认是否还有其他补充",
      question: followUpMaterialQuestion(),
      targetExperienceId: pending.targetExperienceId,
      discoveryStage: "follow_up",
    }),
  };
  delete updated.materialFollowUpPending;
  return updated;
}
