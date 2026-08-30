import type { ApprovalDraft } from "../approvals/types.js";
import type {
  InboxApplicationProposalView,
  InboxInterviewProposalView,
} from "./inbox-action-types.js";

export const INBOX_APPLICATION_UPDATE_ACTION = "inbox.application_update";
export const INBOX_INTERVIEW_UPDATE_ACTION = "inbox.interview_update";

export function createInboxApplicationApprovalDraft(
  proposal: InboxApplicationProposalView,
): ApprovalDraft {
  const target = proposal.clearPendingConfirmation
    ? "确认已投递，清除待核验标记"
    : `${proposal.currentStatus} → ${proposal.targetStatus}`;
  return {
    actionType: INBOX_APPLICATION_UPDATE_ACTION,
    scopeKey: `inbox-application:${proposal.signalId}`,
    risk: "external",
    title: "确认邮件信号并更新投递进度",
    description: "邮件内容不可信；请核对来源、逐字证据、关联岗位和状态变化后再接受。",
    preview: {
      summary: [
        { label: "岗位", value: `${proposal.companyName} · ${proposal.roleName}` },
        { label: "邮件来源", value: proposal.sender },
        { label: "邮件主题", value: proposal.subject },
        { label: "Agent 置信度", value: `${proposal.confidence}%` },
        { label: "Tracker 变更", value: target },
      ],
      items: proposal.evidenceQuotes.map((quote, index) => ({
        title: `证据 ${index + 1}`, description: quote,
      })),
      warnings: [
        "BE5 首版不自动迁移状态；每一条邮件信号都需要你确认。",
        "接受后写入现有 Application LocalSyncStore/Outbox，不修改或发送邮件。",
      ],
    },
  };
}

export function createInboxInterviewApprovalDraft(
  proposal: InboxInterviewProposalView,
): ApprovalDraft {
  return {
    actionType: INBOX_INTERVIEW_UPDATE_ACTION,
    scopeKey: `inbox-interview:${proposal.signalId}`,
    risk: "external",
    title: proposal.mutation === "create" ? "确认邮件邀请并创建面试" : "确认邮件变更并更新面试",
    description: "请核对邮件来源、逐字证据、面试时间和时区后再接受。",
    preview: {
      summary: [
        { label: "岗位", value: `${proposal.companyName} · ${proposal.roleName}` },
        { label: "邮件来源", value: proposal.sender },
        { label: "Agent 置信度", value: `${proposal.confidence}%` },
        { label: "轮次", value: String(proposal.next.roundNumber) },
        { label: "类型", value: proposal.next.interviewType },
        { label: "时间", value: proposal.next.scheduledAt ?? "未确认" },
        { label: "时区", value: proposal.next.timezone },
        { label: "状态", value: proposal.next.status },
      ],
      items: proposal.evidenceQuotes.map((quote, index) => ({
        title: `证据 ${index + 1}`, description: quote,
      })),
      warnings: [
        "接受后写入现有 Interview Proposal/LocalSyncStore/Outbox；不会修改或发送邮件。",
      ],
    },
  };
}
