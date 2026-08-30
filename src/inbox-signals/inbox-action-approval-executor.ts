import type { ActionExecutor } from "../approvals/executor-registry.js";
import type { InboxSignalApplicationService } from "../desktop/main/agent-task/inbox-signal-application-service.js";
import type { InboxSignalInterviewService } from "../desktop/main/agent-task/inbox-signal-interview-service.js";

export function createInboxApplicationApprovalExecutor(
  proposals: InboxSignalApplicationService,
): ActionExecutor {
  return {
    execute: async ({ payload }) => {
      const proposalId = readProposalId(payload);
      const result = await proposals.execute(proposalId);
      return {
        summary: "已按确认的邮件信号更新 Application Tracker。",
        details: {
          proposalId, signalId: result.signalId,
          applicationId: result.application.id,
          status: result.application.status,
          pendingConfirmation: result.application.pendingConfirmation,
        },
      };
    },
  };
}

export function createInboxInterviewApprovalExecutor(
  proposals: InboxSignalInterviewService,
): ActionExecutor {
  return {
    execute: async ({ payload }) => {
      const proposalId = readProposalId(payload);
      const interview = await proposals.execute(proposalId);
      return {
        summary: "已按确认的邮件信号写入 InterviewRound。",
        details: {
          proposalId, interviewId: interview.id,
          applicationId: interview.applicationId,
          scheduledAt: interview.scheduledAt, timezone: interview.timezone,
          status: interview.status,
        },
      };
    },
  };
}

function readProposalId(value: unknown): string {
  if (!value || typeof value !== "object" ||
      typeof (value as { proposalId?: unknown }).proposalId !== "string") {
    throw new Error("Inbox Application approval payload 无效");
  }
  return (value as { proposalId: string }).proposalId;
}
