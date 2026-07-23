import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ExperienceReader } from "../../api/types.js";
import { ApprovalManager } from "../../approvals/approval-manager.js";
import {
  createExperienceImportApprovalDraft,
  createExperienceImportApprovalPayload,
} from "../../import/approval-draft.js";
import { findCandidateDuplicates } from "../../import/duplicate-checker.js";
import { ExperienceImportProposalStore } from "../../import/proposal-store.js";
import { normalizeImportCandidate } from "../../import/validation.js";
import { importCandidateSchema } from "./candidate-schema.js";

const parameters = Type.Object({
  sourceType: Type.Union([Type.Literal("text"), Type.Literal("file")]),
  sourceLabel: Type.Optional(
    Type.String({
      description: "来源说明，例如粘贴文本或附件文件名。",
      maxLength: 300,
    }),
  ),
  candidates: Type.Array(importCandidateSchema, {
    minItems: 1,
    maxItems: 50,
  }),
});

export function createPrepareExperienceImportTool(
  reader: ExperienceReader,
  proposalStore: ExperienceImportProposalStore,
  approvalManager: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_experience_import",
    label: "准备经历导入",
    description:
      "用户要求导入经历时，在取得文本后必须调用本工具；不得由模型自行生成审批内容。把文本提取为结构化候选并向宿主发出待决策卡片，本工具不会写入云端。必须提取原文中的每条独立经历，保留事实和指标，禁止编造。用户要求修改预览时，用完整修正后的 candidates 再调用一次本工具。",
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const normalized = params.candidates.map((candidate, index) =>
        normalizeImportCandidate(
          {
            ...candidate,
            tags: candidate.tags ?? [],
          },
          `candidate-${index + 1}`,
        ),
      );
      const duplicates = await findCandidateDuplicates(
        reader,
        normalized,
        signal,
      );
      const proposal = proposalStore.create(
        params.sourceType,
        normalized,
        duplicates,
        params.sourceLabel,
      );
      const approval = await approvalManager.request(
        createExperienceImportApprovalDraft(proposal),
        createExperienceImportApprovalPayload(proposal),
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              proposal,
              approvalRequestId: approval.id,
              instruction:
                "宿主已显示接受、拒绝和自定义回答的待决策卡片。请简要说明候选内容并等待用户通过卡片决定，不要要求用户输入确认短语。",
            }),
          },
        ],
        details: proposal,
      };
    },
  };
}
