import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { ApprovalManager } from "../../approvals/approval-manager.js";
import { createResumeSaveApprovalDraft } from "../../resume/save/approval-draft.js";
import { ResumeSaveProposalBuilder } from "../../resume/save/proposal-builder.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  title: Type.String({ minLength: 1, maxLength: 300 }),
  mode: Type.Union([
    Type.Literal("new_resume"),
    Type.Literal("replace_resume"),
  ]),
  resumeId: Type.Optional(Type.String({ minLength: 1 })),
  expectedContentHash: Type.Optional(Type.String({ minLength: 1 })),
});

export function createPrepareResumeSaveTool(
  builder: ResumeSaveProposalBuilder,
  approvals: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_resume_save",
    label: "准备保存简历",
    description:
      "只允许 ready_for_approval 候选调用。创建不可变保存审批卡，不直接写云端。覆盖已有简历时必须提供 resumeId 和当前 contentHash。",
    parameters,
    execute: async (_toolCallId, params) => {
      const payload = builder.build(params);
      const approval = await approvals.request(
        createResumeSaveApprovalDraft(payload),
        payload,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              proposalId: payload.proposalId,
              approvalRequestId: approval.id,
              mode: payload.mode,
              title: payload.title,
              instruction:
                "宿主已显示保存审批卡。等待用户通过卡片接受、拒绝或自定义，不得声称已经保存。",
            }),
          },
        ],
        details: {
          proposalId: payload.proposalId,
          candidateId: payload.candidateId,
          mode: payload.mode,
        },
      };
    },
  };
}
