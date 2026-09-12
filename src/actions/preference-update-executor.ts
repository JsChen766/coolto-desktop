import type {
  ActionExecutionContext,
  ActionExecutor,
} from "../approvals/executor-registry.js";
import type {
  PreferenceChangeApprovalPayload,
} from "../preference/approval-draft.js";
import type { PreferenceProposalService } from "../desktop/main/preference/preference-proposal-service.js";

export function createPreferenceUpdateExecutor(
  preferences: PreferenceProposalService,
): ActionExecutor {
  return {
    execute: async (context) => {
      const payload = readPayload(context);
      const result = await preferences.execute(payload.proposalId);
      return { summary: result ? "长期偏好已保存到本机，等待同步" : "已接受服务端长期偏好" };
    },
  };
}

function readPayload(
  context: ActionExecutionContext,
): PreferenceChangeApprovalPayload {
  const payload = context.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      typeof (payload as { proposalId?: unknown }).proposalId !== "string") {
    throw new Error("Preference 审批 Payload 无效");
  }
  const proposalId = (payload as { proposalId: string }).proposalId;
  if (!proposalId.startsWith("preference-")) throw new Error("Preference proposalId 无效");
  return { proposalId };
}
