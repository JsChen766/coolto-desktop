import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { ApprovalManager } from "../approvals/approval-manager.js";
import { createAgentTaskApprovalDraft } from
  "../desktop/main/agent-task/agent-task-approval.js";
import type { AgentTaskProposalService } from
  "../desktop/main/agent-task/agent-task-proposal-service.js";
import type { ApplicationSyncStore } from
  "../desktop/main/application-library/application-sync-store.js";
import type { InterviewSyncStore } from
  "../desktop/main/tracker/interview-sync-store.js";
import type { InboxSignalController } from
  "../inbox-signals/inbox-signal-controller.js";
import {
  followUpLoopTemplate, interviewBriefingLoopTemplate,
  riskDeadlineLoopTemplate, strategyLoopTemplate,
} from "./ai-native-extended-loop-templates.js";
import {
  briefingAutoStartAfter, followUpAutoStartAfter,
} from "./ai-native-loop-schedule.js";

const base = {
  goal: Type.String({ minLength: 1, maxLength: 4000 }),
  expiresAt: Type.String({ minLength: 1, maxLength: 100 }),
};
const followUp = Type.Object({
  ...base, applicationId: Type.String({ minLength: 1, maxLength: 200 }),
  allowedDomains: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 50 }),
  checkIntervalHours: Type.Integer({ minimum: 1, maximum: 720 }),
});
const briefing = Type.Object({
  ...base, applicationId: Type.String({ minLength: 1, maxLength: 200 }),
  interviewId: Type.String({ minLength: 1, maxLength: 200 }),
  researchDomains: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 50 }),
  wakeBeforeMinutes: Type.Integer({ minimum: 15, maximum: 10_080 }),
});
const strategy = Type.Object({
  ...base, reviewIntervalDays: Type.Integer({ minimum: 1, maximum: 90 }),
});
const risk = Type.Object({
  ...base,
  directions: Type.Array(Type.Union([
    Type.Literal("received"), Type.Literal("sent"),
  ]), { minItems: 1, maxItems: 2 }),
  browserWebmail: Type.Boolean(),
  mailConnectionIds: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 20 }),
  allowedDomains: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 50 }),
  pollIntervalMinutes: Type.Integer({ minimum: 5, maximum: 1440 }),
});

export function createPrepareExtendedLoopTools(input: {
  conversationId: string;
  proposals: AgentTaskProposalService;
  approvals: ApprovalManager;
  applications: ApplicationSyncStore;
  interviews: InterviewSyncStore;
  inboxSignals: InboxSignalController;
}): AgentTool[] {
  return [
    definition("prepare_follow_up_loop", "准备跟进邮件 Loop", followUp,
      async (value: any) => {
        const app = await input.applications.getApplication(value.applicationId);
        if (["offer", "rejected"].includes(app.status)) throw new Error("终态投递不创建跟进 Loop");
        return followUpLoopTemplate({
          conversationId: input.conversationId, ...value,
          autoStartAfter: followUpAutoStartAfter(value.checkIntervalHours),
        });
      }),
    definition("prepare_interview_briefing_loop", "准备面试简报 Loop", briefing,
      async (value: any) => {
        await input.applications.getApplication(value.applicationId);
        const interview = await input.interviews.get(value.interviewId);
        if (interview.applicationId !== value.applicationId || interview.status !== "scheduled") {
          throw new Error("必须选择当前投递的 scheduled Interview");
        }
        return interviewBriefingLoopTemplate({
          conversationId: input.conversationId, ...value,
          autoStartAfter: briefingAutoStartAfter(
            interview.scheduledAt, value.wakeBeforeMinutes,
          ),
        });
      }),
    definition("prepare_strategy_loop", "准备个人策略复盘 Loop", strategy,
      async (value: any) => strategyLoopTemplate({ conversationId: input.conversationId, ...value })),
    definition("prepare_risk_deadline_loop", "准备风险与截止监控 Loop", risk,
      async (value: any) => {
        const available = new Set((await input.inboxSignals.listConnections()).map((item) => item.id));
        if (value.mailConnectionIds.some((id: string) => !available.has(id))) {
          throw new Error("风险 Loop 包含不可用邮箱连接");
        }
        return riskDeadlineLoopTemplate({ conversationId: input.conversationId, ...value });
      }),
  ];

  function definition<T extends ReturnType<typeof Type.Object>>(
    name: string,
    label: string,
    parameters: T,
    build: (value: any) => Promise<Parameters<AgentTaskProposalService["prepare"]>[0]>,
  ): AgentTool<T> {
    return {
      name, label,
      description: "准备固定范围的本地 AI Native Loop；用户确认前不运行、不写业务事实。",
      parameters, executionMode: "sequential",
      execute: async (_id, value) => {
        const proposal = input.proposals.prepare(await build(value));
        const approval = await input.approvals.request(
          createAgentTaskApprovalDraft(proposal), { proposalId: proposal.id },
        );
        return {
          content: [{ type: "text", text: JSON.stringify({
            proposalId: proposal.id, approvalRequestId: approval.id,
            instruction: "授权面板已显示；等待用户确认。",
          }) }],
          details: { proposal, approvalRequestId: approval.id },
        };
      },
    };
  }
}
