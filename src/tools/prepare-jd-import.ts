import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { randomUUID } from "node:crypto";

import { ApprovalManager } from "../approvals/approval-manager.js";
import {
  createJdSaveApprovalDraft,
  createJdSaveApprovalPayload,
} from "../jd/approval-draft.js";
import { JdProposalStore } from "../jd/proposal-store.js";
import type { JdProposalRequirement } from "../jd/types.js";

const importanceSchema = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

const v2ImportanceSchema = Type.Union([
  Type.Literal("must_have"),
  Type.Literal("preferred"),
  Type.Literal("optional"),
]);

const requirementSchema = Type.Object({
  text: Type.String({
    minLength: 1,
    maxLength: 2000,
    description: "必须从原文提取或归纳，禁止编造原文不存在的要求。",
  }),
  category: Type.String({
    minLength: 1,
    maxLength: 100,
    description: "要求分类，如 skill、experience、education、language 等。",
  }),
  importance: importanceSchema,
  keywords: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
    maxItems: 20,
  }),
  v2Importance: Type.Optional(v2ImportanceSchema),
  v2Category: Type.Optional(Type.String({ maxLength: 100 })),
});

const parameters = Type.Object({
  rawText: Type.String({
    minLength: 10,
    maxLength: 50_000,
    description: "用户粘贴的 JD 原文，不要修改或截断。",
  }),
  title: Type.String({
    minLength: 1,
    maxLength: 300,
    description: "岗位名称。从原文提取；不确定时使用最接近的描述。",
  }),
  company: Type.Optional(
    Type.String({
      maxLength: 300,
      description: "公司名称。原文中没有时省略，不要猜测。",
    }),
  ),
  targetRole: Type.Optional(
    Type.String({
      maxLength: 300,
      description: "目标角色。原文中没有时省略。",
    }),
  ),
  requirements: Type.Array(requirementSchema, {
    minItems: 1,
    maxItems: 50,
    description: "从原文提取的全部岗位要求。",
  }),
});

export function createPrepareJdImportTool(
  proposalStore: JdProposalStore,
  approvalManager: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_jd_import",
    label: "准备保存岗位描述",
    description:
      "用户粘贴 JD 或要求保存岗位描述时，提取结构化信息后必须调用本工具。" +
      "本工具创建预览卡片供用户确认，不会直接写入云端。" +
      "所有 requirements 必须来自原文，禁止编造。company 和 targetRole 不确定时省略。" +
      "用户要求修改时，用修正后的完整参数再调用一次本工具。",
    parameters,
    execute: async (_toolCallId, params) => {
      const requirements: JdProposalRequirement[] =
        params.requirements.map((r, i) => ({
          clientId: `req-${i + 1}`,
          text: r.text,
          category: r.category,
          importance: r.importance,
          keywords: r.keywords,
          v2Importance: r.v2Importance ?? null,
          v2Category: r.v2Category ?? null,
        }));

      const proposal = proposalStore.create(
        params.rawText,
        params.title,
        params.company ?? null,
        params.targetRole ?? null,
        requirements,
      );

      const idempotencyKey = randomUUID();
      const approval = await approvalManager.request(
        createJdSaveApprovalDraft(proposal),
        createJdSaveApprovalPayload(proposal, idempotencyKey),
      );

      const summary = {
        proposalId: proposal.id,
        title: proposal.title,
        company: proposal.company,
        requirementsCount: proposal.requirements.length,
        approvalRequestId: approval.id,
        instruction:
          "宿主已显示接受、拒绝和自定义回答的待决策卡片。" +
          "请简要说明提取结果并等待用户通过卡片决定，不要要求用户输入确认短语。",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(summary) }],
        details: summary,
      };
    },
  };
}
