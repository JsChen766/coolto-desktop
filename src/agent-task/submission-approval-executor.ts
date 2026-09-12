import type { ActionExecutor } from "../approvals/executor-registry.js";
import type { ApplicationSubmissionService } from
  "../desktop/main/agent-task/application-submission-service.js";

export function createSubmissionApprovalExecutor(
  submissions: ApplicationSubmissionService,
): ActionExecutor {
  return {
    execute: async ({ payload }) => {
      if (isReceiptPayload(payload)) {
        const receiptId = readReceiptId(payload);
        const taskId = readTaskId(payload);
        const receipt = await submissions.confirmReceipt(receiptId, taskId);
        return {
          summary: "用户已确认待核验投递，Tracker Application 已幂等创建。",
          details: {
            receiptId, taskId, applicationId: receipt.applicationId, status: receipt.status,
          },
        };
      }
      const intent = await submissions.confirm(readIntentId(payload));
      return {
        summary: "本次岗位投递已确认，Agent 将在页面未变化时继续提交。",
        details: { intentId: intent.id, taskId: intent.taskId, decision: "confirmed" },
      };
    },
    reject: async ({ payload }) => {
      if (isReceiptPayload(payload)) return;
      await submissions.reject(readIntentId(payload));
    },
  };
}

function isReceiptPayload(payload: unknown): boolean {
  return payload !== null && typeof payload === "object" &&
    typeof Reflect.get(payload, "receiptId") === "string" &&
    typeof Reflect.get(payload, "taskId") === "string";
}

function readIntentId(payload: unknown): string {
  return readSubmissionField(payload, "intentId");
}

function readReceiptId(payload: unknown): string {
  return readSubmissionField(payload, "receiptId");
}
function readTaskId(payload: unknown): string {
  return readSubmissionField(payload, "taskId");
}

function readSubmissionField(payload: unknown, field: string): string {
  if (payload === null || typeof payload !== "object") {
    throw new Error("Submission approval payload 无效");
  }
  const value = Reflect.get(payload, field);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Submission approval payload 无效");
  }
  return value;
}
