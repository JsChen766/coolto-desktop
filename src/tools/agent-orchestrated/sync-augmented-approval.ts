import type { ApprovalManager } from "../../approvals/approval-manager.js";
import {
  createAugmentedApprovalDraft,
  createAugmentedApprovalPayload,
  RESUME_AUGMENTED_CONFIRM_ACTION_TYPE,
} from "../../resume/confirmation/augmented-approval.js";
import { hasPendingAugmentedContent } from
  "../../resume/workspace/augmentation-state.js";
import { resumeAgentNextAction } from
  "../../resume/workspace/agent-next-action.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";

export async function syncAugmentedApproval(
  workspace: ResumeWorkspace,
  approvalManager: ApprovalManager | undefined,
): Promise<string | undefined> {
  if (!approvalManager) return undefined;
  const pending = hasPendingAugmentedContent(workspace);
  const readyForConfirmation =
    resumeAgentNextAction(workspace).mode === "await_augmented_confirmation";
  if (!pending || !readyForConfirmation) {
    await approvalManager.dismissByActionType(
      RESUME_AUGMENTED_CONFIRM_ACTION_TYPE,
    );
    return undefined;
  }
  const request = await approvalManager.request(
    createAugmentedApprovalDraft(workspace),
    createAugmentedApprovalPayload(workspace),
  );
  return request.id;
}
