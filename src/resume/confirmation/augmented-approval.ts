import type { ApprovalDraft } from "../../approvals/types.js";
import type { ResumeWorkspace } from "../workspace/types.js";
import { pendingAugmentedContent } from "../workspace/augmentation-state.js";

export const RESUME_AUGMENTED_CONFIRM_ACTION_TYPE =
  "resume.augmented.confirm";

export interface ResumeAugmentedConfirmPayload {
  candidateId: string;
  expectedRevision: number;
  bulletIds: string[];
}

export function createAugmentedApprovalDraft(
  workspace: ResumeWorkspace,
): ApprovalDraft {
  const pending = pendingAugmentedContent(workspace);
  return {
    actionType: RESUME_AUGMENTED_CONFIRM_ACTION_TYPE,
    scopeKey: `resume-augmented:${workspace.candidateId}`,
    risk: "sensitive",
    title: "确认 AI 补写内容",
    description:
      "这些内容并非直接来自经历仓库。接受后标记为已确认；拒绝后会移除整条补写 bullet 或仅回退补写片段。",
    preview: {
      summary: [
        { label: "待确认内容", value: `${pending.length} 条` },
        { label: "简历版本", value: String(workspace.revision) },
      ],
      items: pending.map((item) => ({
        title: item.text,
        warning: item.kind === "fragment"
          ? "AI 补写修饰片段，拒绝后恢复原 bullet"
          : "AI 补写完整 bullet，拒绝后从草稿移除",
      })),
    },
  };
}

export function createAugmentedApprovalPayload(
  workspace: ResumeWorkspace,
): ResumeAugmentedConfirmPayload {
  return {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
    bulletIds: [...new Set(
      pendingAugmentedContent(workspace).map((item) => item.bulletId),
    )],
  };
}

export function readAugmentedApprovalPayload(
  payload: unknown,
): ResumeAugmentedConfirmPayload {
  if (!payload || typeof payload !== "object") throw new Error("AI 补写审批无效");
  const value = payload as Partial<ResumeAugmentedConfirmPayload>;
  if (
    typeof value.candidateId !== "string" ||
    !Number.isInteger(value.expectedRevision) ||
    !Array.isArray(value.bulletIds) ||
    value.bulletIds.some((id) => typeof id !== "string")
  ) {
    throw new Error("AI 补写审批 Payload 无效");
  }
  return value as ResumeAugmentedConfirmPayload;
}
