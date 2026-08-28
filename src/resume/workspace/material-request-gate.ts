import { bulletCountRepairPlan } from "./bullet-count-repair.js";
import { RESUME_LAYOUT_TOLERANCE_PX } from "../compiler-types.js";
import { createResumeMaterialRequest } from "./material-request.js";
import type { ResumeWorkspace } from "./types.js";

export function applyBulletCountMaterialGate(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  if (workspace.reuseAdaptation?.status === "pending") return workspace;
  if (
    workspace.status === "needs_user_decision" &&
    workspace.materialRequest?.kind !== "bullet_count_insufficient"
  ) return workspace;
  if (
    workspace.compileResult.pageCount !== 1 ||
    workspace.compileResult.overflowPx > RESUME_LAYOUT_TOLERANCE_PX
  ) return clearBulletCountRequest(workspace);

  const plan = bulletCountRepairPlan(workspace);
  if (plan.mode === "request_more_material") {
    if (!workspace.reuseBase && plan.initialDraftTargets.length) {
      return clearBulletCountRequest(workspace);
    }
    return {
      ...workspace,
      status: "needs_user_decision",
      materialRequest: createResumeMaterialRequest(workspace, {
        kind: "bullet_count_insufficient",
        reason: "所选经历的独立事实数量不足以满足当前经历层级的最低 bullet 数",
        question: plan.question,
        targetExperienceId: plan.targetExperienceId,
      }),
    };
  }
  if (workspace.materialRequest?.kind !== "bullet_count_insufficient") {
    return workspace;
  }
  return clearBulletCountRequest(workspace);
}

function clearBulletCountRequest(workspace: ResumeWorkspace): ResumeWorkspace {
  if (workspace.materialRequest?.kind !== "bullet_count_insufficient") {
    return workspace;
  }
  const resumed = { ...workspace, status: "writing" as const };
  delete resumed.materialRequest;
  return resumed;
}
