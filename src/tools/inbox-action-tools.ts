import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ApprovalManager } from "../approvals/approval-manager.js";
import type { InboxSignalApplicationService } from "../desktop/main/agent-task/inbox-signal-application-service.js";
import { createInboxApplicationApprovalDraft } from "../inbox-signals/inbox-action-approval.js";

const parameters = Type.Object({
  signalId: Type.String({ minLength: 1, maxLength: 200 }),
});

export function createPrepareInboxApplicationTool(input: {
  proposals: InboxSignalApplicationService;
  approvals: ApprovalManager;
}): AgentTool<typeof parameters> {
  return {
    name: "prepare_inbox_application_update",
    label: "准备邮件信号 Tracker 更新",
    description:
      "根据 Agent 已分类且已可靠关联的邮件信号，准备不可变 Application 更新审批。" +
      "用户接受前不会写 Tracker；不处理邮件发送。",
    parameters,
    executionMode: "sequential",
    execute: async (_id, value) => {
      const proposal = await input.proposals.prepare(value.signalId);
      const approval = await input.approvals.request(
        createInboxApplicationApprovalDraft(proposal),
        { proposalId: proposal.id },
      );
      return {
        content: [{ type: "text", text: JSON.stringify({
          proposalId: proposal.id, approvalRequestId: approval.id,
          instruction: "邮件信号与 Tracker 变更审批卡已显示，等待用户确认。",
        }) }],
        details: { proposal, approvalRequestId: approval.id },
      };
    },
  };
}
