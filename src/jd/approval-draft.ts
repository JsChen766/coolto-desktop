import type { ApprovalDraft } from "../approvals/types.js";
import type { JdProposal, JdSaveApprovalPayload } from "./types.js";

export const JD_SAVE_ACTION_TYPE = "jd.save";
export const JD_SAVE_APPROVAL_SCOPE = "jd.save";

export function createJdSaveApprovalDraft(
  proposal: JdProposal,
): ApprovalDraft {
  return {
    actionType: JD_SAVE_ACTION_TYPE,
    scopeKey: JD_SAVE_APPROVAL_SCOPE,
    risk: "write",
    title: "保存岗位描述到云端",
    description:
      "接受后会把以下 JD 写入 Coolto 云端。",
    preview: {
      summary: [
        { label: "岗位", value: proposal.title },
        ...(proposal.company
          ? [{ label: "公司", value: proposal.company }]
          : []),
        {
          label: "要求数量",
          value: `${proposal.requirements.length} 条`,
        },
      ],
      items: proposal.requirements.map((req) => ({
        title: req.text,
        fields: [
          { label: "分类", value: req.category },
          { label: "重要性", value: req.importance },
          ...(req.v2Importance
            ? [{ label: "v2 重要性", value: req.v2Importance }]
            : []),
        ],
      })),
    },
  };
}

export function createJdSaveApprovalPayload(
  proposal: JdProposal,
  idempotencyKey: string,
): JdSaveApprovalPayload {
  return {
    proposalId: proposal.id,
    rawText: proposal.rawText,
    title: proposal.title,
    company: proposal.company,
    targetRole: proposal.targetRole,
    requirements: structuredClone(proposal.requirements),
    idempotencyKey,
  };
}
