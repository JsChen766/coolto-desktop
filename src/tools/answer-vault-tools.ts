import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ApprovalManager } from "../approvals/approval-manager.js";
import { createAnswerVaultApprovalDraft } from "../agent-task/answer-vault-approval.js";
import type { AnswerVaultStore } from "../agent-task/answer-vault-store.js";
import { ANSWER_VAULT_CATEGORIES } from "../agent-task/answer-vault-types.js";

const category = Type.Union(
  ANSWER_VAULT_CATEGORIES.map((value) => Type.Literal(value)),
);
const readParameters = Type.Object({
  category: Type.Optional(category),
  domain: Type.Optional(Type.String({ minLength: 1, maxLength: 253 })),
});
const prepareParameters = Type.Object({
  category,
  questionKey: Type.String({ minLength: 1, maxLength: 500 }),
  value: Type.String({ minLength: 1, maxLength: 2_000 }),
  scopeDomains: Type.Array(Type.String({ minLength: 1, maxLength: 253 }), {
    maxItems: 100,
  }),
  expiresAt: Type.Optional(Type.Union([
    Type.String({ minLength: 1, maxLength: 100 }), Type.Null(),
  ])),
});

export function createAnswerVaultTools(input: {
  store: AnswerVaultStore;
  approvals?: ApprovalManager;
}): AgentTool[] {
  const tools: AgentTool[] = [createReadTool(input.store)];
  if (input.approvals) tools.push(createPrepareTool(input.store, input.approvals));
  return tools;
}

function createReadTool(store: AnswerVaultStore): AgentTool<typeof readParameters> {
  return {
    name: "get_answer_vault",
    label: "读取 Answer Vault",
    description: "读取用户已确认、未过期且适用于指定站点的常用求职答案。",
    parameters: readParameters,
    execute: async (_id, value) => {
      const entries = await store.list({
        ...(value.category ? { category: value.category } : {}),
        ...(value.domain ? { domain: value.domain } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ entries }) }],
        details: { entries },
      };
    },
  };
}

function createPrepareTool(
  store: AnswerVaultStore,
  approvals: ApprovalManager,
): AgentTool<typeof prepareParameters> {
  return {
    name: "prepare_answer_vault_entry",
    label: "准备保存 Answer Vault",
    description:
      "仅在用户明确提供并要求复用常用求职事实时，准备不可变审批。" +
      "接受前不会写入；禁止保存 EEO、身份/法律声明、密码或 OTP。",
    parameters: prepareParameters,
    executionMode: "sequential",
    execute: async (_id, value) => {
      const payload = {
        category: value.category,
        questionKey: value.questionKey,
        value: value.value,
        scopeDomains: value.scopeDomains,
        ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
      };
      await store.validate(payload);
      const approval = await approvals.request(
        createAnswerVaultApprovalDraft(payload), payload,
      );
      return {
        content: [{ type: "text", text: JSON.stringify({
          approvalRequestId: approval.id,
          instruction: "审批卡已显示；接受前 Answer Vault 不会写入。",
        }) }],
        details: { approvalRequestId: approval.id },
      };
    },
  };
}
