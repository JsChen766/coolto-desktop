import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { AiNativeLoopService } from
  "../desktop/main/agent-task/ai-native-loop-service.js";
import type { ApprovalManager } from "../approvals/approval-manager.js";
import { createLoopReminderApprovalDraft } from
  "../agent-task/loop-reminder-approval.js";

const application = Type.Object({
  applicationId: Type.String({ minLength: 1, maxLength: 200 }),
});
const followUp = Type.Object({
  applicationId: Type.String({ minLength: 1, maxLength: 200 }),
  subject: Type.String({ minLength: 1, maxLength: 1_000 }),
  body: Type.String({ minLength: 1, maxLength: 20_000 }),
  scheduledFor: Type.String({ minLength: 1, maxLength: 100 }),
  timezone: Type.String({ minLength: 1, maxLength: 100 }),
});
const brief = Type.Object({
  applicationId: Type.String({ minLength: 1, maxLength: 200 }),
  interviewId: Type.String({ minLength: 1, maxLength: 200 }),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  sections: Type.Array(Type.Object({
    heading: Type.String({ minLength: 1, maxLength: 300 }),
    content: Type.String({ minLength: 1, maxLength: 8_000 }),
    sourceRefs: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), {
      minItems: 1, maxItems: 20,
    }),
  }), { minItems: 1, maxItems: 12 }),
});
const strategy = Type.Object({
  snapshotHash: Type.String({ minLength: 1, maxLength: 200 }),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  summary: Type.String({ minLength: 1, maxLength: 4_000 }),
  recommendations: Type.Array(Type.String({ minLength: 1, maxLength: 1_000 }), {
    minItems: 1, maxItems: 5,
  }),
});
const risk = Type.Object({
  signalId: Type.String({ minLength: 1, maxLength: 200 }),
  severity: Type.Union([Type.Literal("review"), Type.Literal("high")]),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  rationale: Type.String({ minLength: 1, maxLength: 4_000 }),
  deadlineAt: Type.Optional(Type.Union([
    Type.String({ minLength: 1, maxLength: 100 }), Type.Null(),
  ])),
});
const reminder = Type.Object({
  applicationId: Type.String({ minLength: 1, maxLength: 200 }),
  signalId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  interviewId: Type.Optional(Type.Union([
    Type.String({ minLength: 1, maxLength: 200 }), Type.Null(),
  ])),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  remindAt: Type.String({ minLength: 1, maxLength: 100 }),
});

export function createAiNativeLoopTools(
  service: AiNativeLoopService,
  approvals?: ApprovalManager,
): AgentTool[] {
  const tools = [
    tool("get_application_loop_context", "读取 Loop 投递上下文", application,
      (input) => service.applicationContext(input.applicationId)),
    tool("record_follow_up_draft", "记录跟进邮件草稿", followUp,
      (input) => service.createFollowUp(input)),
    tool("record_interview_brief", "记录面试准备简报", brief,
      (input) => service.createBrief(input)),
    tool("get_application_strategy_metrics", "读取个人投递指标", Type.Object({}),
      () => service.strategyMetrics()),
    tool("record_strategy_proposal", "记录个人策略建议", strategy,
      (input) => service.createStrategy(input)),
    tool("record_risk_notice", "记录风险或截止提示", risk,
      (input) => service.createRiskNotice(input)),
  ];
  if (approvals) tools.push({
    name: "prepare_loop_reminder", label: "准备求职提醒",
    description: "根据已确认的截止或面试时间准备 App Reminder；用户接受前零写入。",
    parameters: reminder, executionMode: "sequential",
    execute: async (_id, input) => {
      const proposal = await service.prepareReminder(input as never);
      const approval = await approvals.request(
        createLoopReminderApprovalDraft(proposal), { proposalId: proposal.id },
      );
      return {
        content: [{ type: "text", text: JSON.stringify({
          proposalId: proposal.id, approvalRequestId: approval.id,
          instruction: "Reminder 审批卡已显示，等待用户确认。",
        }) }],
        details: { proposal, approvalRequestId: approval.id },
      };
    },
  } as AgentTool<any>);
  return tools;
}

function tool<T extends ReturnType<typeof Type.Object>>(
  name: string,
  label: string,
  parameters: T,
  execute: (input: any) => Promise<unknown>,
): AgentTool<T> {
  return {
    name, label,
    description:
      "在当前 AgentTask 的本地产物层记录可审计结果；不直接发送邮件、修改搜索授权或写入业务事实。",
    parameters,
    executionMode: "sequential",
    execute: async (_id, input) => {
      const details = await execute(input);
      return { content: [{ type: "text", text: JSON.stringify(details) }], details };
    },
  };
}
