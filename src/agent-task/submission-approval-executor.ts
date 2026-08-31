import type { ActionExecutor } from "../approvals/executor-registry.js";
import type { ApplicationSubmissionService } from
  "../desktop/main/agent-task/application-submission-service.js";

export function createSubmissionApprovalExecutor(
  submissions: ApplicationSubmissionService,
): ActionExecutor {
  return {
    execute: async ({ payload }) => {
      const intent = await submissions.confirm(readIntentId(payload));
      return {
        summary: "本次岗位投递已确认，Agent 将在页面未变化时继续提交。",
        details: { intentId: intent.id, taskId: intent.taskId, decision: "confirmed" },
      };
    },
    reject: async ({ payload }) => {
      await submissions.reject(readIntentId(payload));
    },
  };
}

function readIntentId(payload: unknown): string {
  if (!payload || typeof payload !== "object" ||
      typeof (payload as { intentId?: unknown }).intentId !== "string") {
    throw new Error("Submission approval payload 无效");
  }
  return (payload as { intentId: string }).intentId;
}
