import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ApprovalManager } from "../approvals/approval-manager.js";
import type { JsonValue } from "../agent-task/json-types.js";
import type { AgentTaskProposalService } from "../desktop/main/agent-task/agent-task-proposal-service.js";
import { createAgentTaskApprovalDraft } from "../desktop/main/agent-task/agent-task-approval.js";

const jsonObject = Type.Record(Type.String(), Type.Unknown());
const parameters = Type.Object({
  goal: Type.String({ minLength: 1, maxLength: 4000 }),
  allowedDomains: Type.Array(Type.String({ maxLength: 500 }), { maxItems: 100 }),
  blockedDomains: Type.Optional(
    Type.Array(Type.String({ maxLength: 500 }), { maxItems: 100 }),
  ),
  allowedActions: Type.Array(Type.String({ maxLength: 200 }), { maxItems: 50 }),
  jobCriteria: Type.Optional(jsonObject),
  assetPolicy: Type.Optional(jsonObject),
  answerPolicy: Type.Optional(jsonObject),
  connectorPolicy: Type.Optional(jsonObject),
  unattended: Type.Boolean(),
  expiresAt: Type.String({ minLength: 1, maxLength: 100 }),
});

export function createPrepareAgentTaskTool(input: {
  conversationId: string;
  proposals: AgentTaskProposalService;
  approvals: ApprovalManager;
}): AgentTool<typeof parameters> {
  return {
    name: "prepare_agent_task",
    label: "准备 Agent 托管任务",
    description:
      "把用户的浏览器任务目标和授权范围冻结为 Delegation Proposal，展示给用户确认。" +
      "不会立即运行、导航或写页面。最低匹配固定 80%，无每日投递业务上限；" +
      "mail.send 不可授权，任务只在 App 打开时运行。授权 browser.submit 时，" +
      "assetPolicy 必须冻结 resumeId、resumeTitle、resumeContentHash 和" +
      " submissionMode=confirm_each。",
    parameters,
    executionMode: "sequential",
    execute: async (_id, value) => {
      const proposal = input.proposals.prepare({
        conversationId: input.conversationId,
        goal: value.goal,
        allowedDomains: value.allowedDomains,
        blockedDomains: value.blockedDomains ?? [],
        allowedActions: value.allowedActions,
        jobCriteria: (value.jobCriteria ?? {}) as Record<string, JsonValue>,
        assetPolicy: (value.assetPolicy ?? {}) as Record<string, JsonValue>,
        answerPolicy: (value.answerPolicy ?? {}) as Record<string, JsonValue>,
        connectorPolicy: (value.connectorPolicy ?? {}) as Record<string, JsonValue>,
        unattended: value.unattended,
        expiresAt: value.expiresAt,
      });
      const approval = await input.approvals.request(
        createAgentTaskApprovalDraft(proposal),
        { proposalId: proposal.id },
      );
      return {
        content: [{ type: "text", text: JSON.stringify({
          proposalId: proposal.id,
          approvalRequestId: approval.id,
          instruction: "授权面板已显示，等待用户确认；不要重复创建或开始执行。",
        }) }],
        details: { proposal, approvalRequestId: approval.id },
      };
    },
  };
}
