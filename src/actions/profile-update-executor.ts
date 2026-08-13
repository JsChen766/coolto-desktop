import type {
  ActionExecutionContext,
  ActionExecutor,
} from "../approvals/executor-registry.js";
import type { ProfileProposalExecutor } from "../profile/types.js";
import type { ProfileUpdateApprovalPayload } from "../profile/approval-draft.js";

export function createProfileUpdateExecutor(
  profiles: ProfileProposalExecutor,
): ActionExecutor {
  return {
    execute: async (context) => {
      const payload = readPayload(context.payload);
      await profiles.execute(payload.proposalId);
      return { summary: "个人资料已更新" };
    },
  };
}

function readPayload(payload: unknown): ProfileUpdateApprovalPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { proposalId?: unknown }).proposalId !== "string"
  ) {
    throw new Error("个人资料更新审批 Payload 无效");
  }
  return { proposalId: (payload as { proposalId: string }).proposalId };
}
