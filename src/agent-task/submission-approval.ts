import type { ApprovalDraft } from "../approvals/types.js";
import type { SubmissionIntentV1 } from "./submission-types.js";

export const SUBMISSION_CONFIRM_ACTION = "browser.submission_confirm";

export function createSubmissionApprovalDraft(intent: SubmissionIntentV1): ApprovalDraft {
  return {
    actionType: SUBMISSION_CONFIRM_ACTION,
    scopeKey: `submission:${intent.id}`,
    risk: "external",
    title: "确认提交这份岗位申请",
    description: "这是本次岗位的最终提交确认；接受后 Agent 才能点击当前页面的提交按钮。",
    preview: {
      summary: [
        { label: "公司", value: intent.company },
        { label: "岗位", value: intent.role },
        { label: "简历", value: intent.resumeTitle },
        { label: "目标页面", value: safeOrigin(intent.targetUrl) },
        { label: "简历版本", value: "已冻结当前确认版本" },
      ],
      warnings: [
        "确认仅对当前岗位、当前简历版本和当前页面生效，页面变化后必须重新确认。",
        "拒绝不会点击提交，也不会创建 Application 投递事实。",
      ],
    },
  };
}
export function createSubmissionReceiptConfirmationDraft(
  receiptId: string,
): ApprovalDraft {
  return {
    actionType: SUBMISSION_CONFIRM_ACTION,
    scopeKey: `submission-receipt:${receiptId}`,
    risk: "write",
    title: "确认待核验投递已发生",
    description:
      "用户明确确认站点结果后，接受此卡才会创建唯一 Tracker Application；不会再次点击站点提交。",
    preview: {
      summary: [{ label: "SubmissionReceipt", value: receiptId }],
      warnings: [
        "这只确认既有本地投递回执，不会重新访问或提交招聘网站。",
        "拒绝不会创建 Application。",
      ],
    },
  };
}

function safeOrigin(value: string): string {
  try { return new URL(value).origin; } catch { return "无效地址"; }
}
