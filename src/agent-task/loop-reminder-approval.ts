import type { ApprovalDraft } from "../approvals/types.js";
import type { TrackerChildProposal, Reminder } from "../tracker/child-types.js";

export const LOOP_REMINDER_ACTION = "ai_native.reminder_create";

export function createLoopReminderApprovalDraft(
  proposal: TrackerChildProposal<Reminder>,
): ApprovalDraft {
  if (!proposal.next) throw new Error("Reminder Proposal 缺少目标记录");
  return {
    actionType: LOOP_REMINDER_ACTION,
    scopeKey: `ai-native-reminder:${proposal.applicationId}:${proposal.id}`,
    risk: "write",
    title: "添加求职提醒",
    description: "确认后写入 App Tracker，并由本机通知调度执行。",
    preview: { summary: [
      { label: "提醒", value: proposal.next.title },
      { label: "时间", value: proposal.next.remindAt },
      { label: "关联", value: proposal.next.interviewRoundId ? "面试日程" : "投递记录" },
    ] },
  };
}
