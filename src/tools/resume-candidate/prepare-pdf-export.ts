import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { ApprovalManager } from "../../approvals/approval-manager.js";
import { createResumePdfExportApprovalDraft } from "../../resume/export/approval-draft.js";
import { ResumePdfExportProposalBuilder } from "../../resume/export/proposal-builder.js";
import type { ResumePdfExportSourceInput } from "../../resume/export/types.js";

const parameters = Type.Object({
  source: Type.Union([Type.Literal("candidate"), Type.Literal("published")]),
  candidateId: Type.Optional(Type.String({ minLength: 1 })),
  expectedRevision: Type.Optional(Type.Integer({ minimum: 0 })),
  resumeId: Type.Optional(Type.String({ minLength: 1 })),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
});

export function createPrepareResumePdfExportTool(
  builder: ResumePdfExportProposalBuilder,
  approvals: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_resume_pdf_export",
    label: "准备导出简历 PDF",
    description:
      "为 ready_for_approval 候选或云端正式简历创建本地导出审批。工具本身不弹对话框、不打印、不写文件。",
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const payload = await builder.build(sourceInput(params), signal);
      const approval = await approvals.request(
        createResumePdfExportApprovalDraft(payload),
        payload,
      );
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            proposalId: payload.proposalId,
            approvalRequestId: approval.id,
            filename: payload.suggestedFilename,
            instruction:
              "宿主已显示 PDF 导出审批。用户接受后还需在系统对话框选择保存位置；不得声称已经导出。",
          }),
        }],
        details: {
          proposalId: payload.proposalId,
          source: payload.source,
          suggestedFilename: payload.suggestedFilename,
        },
      };
    },
  };
}

function sourceInput(params: {
  source: "candidate" | "published";
  candidateId?: string;
  expectedRevision?: number;
  resumeId?: string;
  title?: string;
}): ResumePdfExportSourceInput {
  if (params.source === "candidate") {
    if (!params.candidateId || params.expectedRevision === undefined || !params.title) {
      throw new Error("Candidate PDF export requires candidateId, expectedRevision, and title");
    }
    return {
      source: "candidate",
      candidateId: params.candidateId,
      expectedRevision: params.expectedRevision,
      title: params.title,
    };
  }
  if (!params.resumeId) throw new Error("Published PDF export requires resumeId");
  return {
    source: "published",
    resumeId: params.resumeId,
    ...(params.title ? { title: params.title } : {}),
  };
}
