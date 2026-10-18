import type { ApprovalDraft, ApprovalPreviewPreference } from "../approvals/types.js";
import { scopeKey } from "./normalizer.js";
import type { PreferenceWriteProposalV1 } from "./types.js";

export const PREFERENCE_CHANGE_ACTION_TYPE = "preference.change";
export const PREFERENCE_CHANGE_APPROVAL_SCOPE = "preference.change";

export interface PreferenceChangeApprovalPayload {
  proposalId: string;
}

export function createPreferenceApprovalDraft(
  proposal: PreferenceWriteProposalV1,
): ApprovalDraft {
  const current = proposal.current;
  const next = proposal.next;
  const preview: ApprovalPreviewPreference = {
    action: previewAction(proposal),
    key: next?.key ?? current?.key ?? "unknown",
    currentValue: current ? valueText(current.value) : "未设置",
    proposedValue: next ? valueText(next.value) : "删除后不再生效",
    scope: next ? scopeKey(next.scope) : current ? scopeKey(current.scope) : "global",
    priority: next?.priority ?? current?.priority ?? null,
    source: next?.source ?? current?.source ?? null,
    explanation: proposal.explanation,
  };
  return {
    actionType: PREFERENCE_CHANGE_ACTION_TYPE,
    scopeKey: PREFERENCE_CHANGE_APPROVAL_SCOPE,
    risk: preview.action === "delete" ? "destructive" : "write",
    title: actionTitle(preview.action),
    description: "接受后会写入本机长期偏好（经本地同步队列持久化；开源版不连接 Coolto 云）。只影响之后的新任务；已生成的简历、投递记录和历史对话不会改变。",
    preview: {
      summary: [
        { label: "规则", value: preview.key },
        { label: "作用域", value: preview.scope },
        { label: "优先级", value: preview.priority === null ? "未设置" : String(preview.priority) },
      ],
      preference: preview,
    },
  };
}

export function createPreferenceApprovalPayload(
  proposal: PreferenceWriteProposalV1,
): PreferenceChangeApprovalPayload {
  return { proposalId: proposal.id };
}

function previewAction(
  proposal: PreferenceWriteProposalV1,
): ApprovalPreviewPreference["action"] {
  if (proposal.action === "delete") return "delete";
  if (proposal.action !== "update") return proposal.action;
  if (proposal.next?.status === "disabled") return "disable";
  if (proposal.current?.status === "disabled" && proposal.next?.status === "active") return "enable";
  return proposal.action;
}

function actionTitle(action: ApprovalPreviewPreference["action"]): string {
  return {
    create: "保存为长期偏好", update: "更新长期偏好", disable: "停用长期偏好",
    enable: "重新启用长期偏好", delete: "删除长期偏好", reapply: "重新应用长期偏好",
    accept_server: "接受已拉取副本的长期偏好",
  }[action];
}

function valueText(value: string | string[]): string {
  return Array.isArray(value) ? value.join("、") : value;
}
