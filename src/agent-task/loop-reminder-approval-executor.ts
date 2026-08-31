import type { ActionExecutor } from "../approvals/executor-registry.js";
import type { AiNativeLoopService } from
  "../desktop/main/agent-task/ai-native-loop-service.js";

export function createLoopReminderApprovalExecutor(
  service: AiNativeLoopService,
): ActionExecutor {
  return {
    execute: async ({ payload }) => {
      const proposalId = readProposalId(payload);
      const result = await service.executeReminder(proposalId);
      if (!("applicationId" in result)) throw new Error("Reminder Proposal 返回删除结果");
      return {
        summary: "提醒已添加到 App 日程。",
        details: { proposalId, reminderId: result.id,
          applicationId: result.applicationId, remindAt: result.remindAt },
      };
    },
  };
}

function readProposalId(value: unknown): string {
  if (!value || typeof value !== "object" ||
      typeof (value as { proposalId?: unknown }).proposalId !== "string") {
    throw new Error("AI Native Reminder approval payload 无效");
  }
  return (value as { proposalId: string }).proposalId;
}
