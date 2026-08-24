import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ApprovalManager } from "../approvals/approval-manager.js";
import type { InboxSignalInterviewService } from "../desktop/main/agent-task/inbox-signal-interview-service.js";
import { createInboxInterviewApprovalDraft } from "../inbox-signals/inbox-action-approval.js";

const parameters = Type.Object({
  signalId: Type.String({ minLength: 1, maxLength: 200 }),
  mutation: Type.Union([Type.Literal("create"), Type.Literal("update")]),
  interviewId: Type.Optional(Type.Union([
    Type.String({ minLength: 1, maxLength: 200 }), Type.Null(),
  ])),
  value: Type.Object({
    roundNumber: Type.Integer({ minimum: 1, maximum: 100 }),
    interviewType: Type.Union([
      Type.Literal("phone"), Type.Literal("video"), Type.Literal("onsite"),
      Type.Literal("hr"), Type.Literal("technical"), Type.Literal("case"),
      Type.Literal("other"),
    ]),
    scheduledAt: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
    timezone: Type.String({ minLength: 1, maxLength: 64 }),
    durationMinutes: Type.Optional(Type.Union([
      Type.Integer({ minimum: 1, maximum: 1440 }), Type.Null(),
    ])),
    locationOrLink: Type.Optional(Type.Union([Type.String({ maxLength: 2_000 }), Type.Null()])),
    interviewer: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
    status: Type.Union([
      Type.Literal("scheduled"), Type.Literal("completed"), Type.Literal("canceled"),
    ]),
  }),
});

export function createPrepareInboxInterviewTool(input: {
  proposals: InboxSignalInterviewService;
  approvals: ApprovalManager;
}): AgentTool<typeof parameters> {
  return {
    name: "prepare_inbox_interview_update",
    label: "准备邮件面试更新",
    description:
      "根据已分类并关联 Application 的面试邀请/变更，准备不可变 Interview 审批。" +
      "创建邀请必须有完整时间和时区；用户接受前零写入。",
    parameters, executionMode: "sequential",
    execute: async (_id, value) => {
      const proposal = await input.proposals.prepare(value);
      const approval = await input.approvals.request(
        createInboxInterviewApprovalDraft(proposal),
        { proposalId: proposal.id },
      );
      return {
        content: [{ type: "text", text: JSON.stringify({
          proposalId: proposal.id, approvalRequestId: approval.id,
          instruction: "面试邮件证据、时间和时区审批卡已显示，等待用户确认。",
        }) }],
        details: { proposal, approvalRequestId: approval.id },
      };
    },
  };
}
