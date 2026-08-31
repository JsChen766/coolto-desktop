import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ApprovalManager } from "../approvals/approval-manager.js";
import { createAgentTaskApprovalDraft } from
  "../desktop/main/agent-task/agent-task-approval.js";
import type { AgentTaskProposalService } from
  "../desktop/main/agent-task/agent-task-proposal-service.js";
import type { ResumePublicationGateway } from "../resume/save/types.js";
import type { InboxSignalController } from
  "../inbox-signals/inbox-signal-controller.js";
import {
  mailScheduleLoopTemplate,
  resumeJobLoopTemplate,
  type MailScheduleLoopInput,
  type ResumeJobLoopInput,
} from "./ai-native-loop-templates.js";

const source = Type.Object({
  provider: Type.Union([Type.Literal("greenhouse"), Type.Literal("lever")]),
  sourceKey: Type.String({ minLength: 1, maxLength: 100 }),
  company: Type.String({ minLength: 1, maxLength: 300 }),
});
const resumeJobParameters = Type.Object({
  goal: Type.String({ minLength: 1, maxLength: 4000 }),
  resumeId: Type.String({ minLength: 1, maxLength: 200 }),
  resumeTitle: Type.String({ minLength: 1, maxLength: 500 }),
  resumeContentHash: Type.String({ pattern: "^[0-9a-f]{64}$" }),
  sources: Type.Array(source, { minItems: 1, maxItems: 20 }),
  applicationDomains: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), {
    maxItems: 50,
  }),
  expiresAt: Type.String({ minLength: 1, maxLength: 100 }),
});
const mailScheduleParameters = Type.Object({
  goal: Type.String({ minLength: 1, maxLength: 4000 }),
  directions: Type.Array(Type.Union([
    Type.Literal("received"), Type.Literal("sent"),
  ]), { minItems: 1, maxItems: 2 }),
  browserWebmail: Type.Boolean(),
  mailConnectionIds: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
    maxItems: 20,
  }),
  allowedDomains: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), {
    maxItems: 50,
  }),
  pollIntervalMinutes: Type.Integer({ minimum: 5, maximum: 1440 }),
  expiresAt: Type.String({ minLength: 1, maxLength: 100 }),
});

export function createPrepareAiNativeLoopTools(input: {
  conversationId: string;
  proposals: AgentTaskProposalService;
  approvals: ApprovalManager;
  resumes?: ResumePublicationGateway;
  inboxSignals?: InboxSignalController;
}): AgentTool[] {
  return [
    {
      name: "prepare_resume_job_loop",
      label: "准备选简历自动找岗任务",
      description:
        "基于已读取且 passed 的发布 Resume，冻结版本、公开 ATS 来源和逐岗位最终确认规则。" +
        "只显示 Delegation Proposal，不立即搜索、导航、填写或提交。",
      parameters: resumeJobParameters,
      executionMode: "sequential",
      execute: async (_id, value) => {
        const loop = value as Omit<ResumeJobLoopInput, "conversationId">;
        await validateResume(input.resumes, loop);
        return prepare(input, resumeJobLoopTemplate({
          conversationId: input.conversationId, ...loop,
        }));
      },
    },
    {
      name: "prepare_mail_schedule_loop",
      label: "准备邮件联动 App 日程任务",
      description:
        "冻结收/发件方向、邮箱来源、轮询间隔和逐条 Tracker/Interview 审批。" +
        "只显示 Delegation Proposal，不读取邮件或写入日程。",
      parameters: mailScheduleParameters,
      executionMode: "sequential",
      execute: async (_id, value) => {
        const loop = value as Omit<MailScheduleLoopInput, "conversationId">;
        await validateConnections(input.inboxSignals, loop.mailConnectionIds);
        return prepare(input, mailScheduleLoopTemplate({
          conversationId: input.conversationId, ...loop,
        }));
      },
    },
  ];
}

async function validateResume(
  resumes: ResumePublicationGateway | undefined,
  input: Omit<ResumeJobLoopInput, "conversationId">,
): Promise<void> {
  if (!resumes) throw new Error("发布 Resume 读取能力不可用");
  const resume = await resumes.getResume(input.resumeId);
  if (resume.status !== "active" || resume.qualityStatus !== "passed" ||
      resume.title !== input.resumeTitle || resume.contentHash !== input.resumeContentHash) {
    throw new Error("所选 Resume 已归档、未通过质量门槛或版本已变化");
  }
}

async function validateConnections(
  inbox: InboxSignalController | undefined,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  if (!inbox) throw new Error("邮箱连接读取能力不可用");
  const available = new Set((await inbox.listConnections()).map((item) => item.id));
  if (ids.some((id) => !available.has(id))) {
    throw new Error("邮件 Loop 包含不存在或不属于当前账号的邮箱连接");
  }
}

async function prepare(
  input: {
    proposals: AgentTaskProposalService;
    approvals: ApprovalManager;
  },
  delegation: Parameters<AgentTaskProposalService["prepare"]>[0],
) {
  const proposal = input.proposals.prepare(delegation);
  const approval = await input.approvals.request(
    createAgentTaskApprovalDraft(proposal), { proposalId: proposal.id },
  );
  return {
    content: [{ type: "text" as const, text: JSON.stringify({
      proposalId: proposal.id,
      approvalRequestId: approval.id,
      instruction: "正式 Loop 授权面板已显示；等待用户确认，不要重复创建。",
    }) }],
    details: { proposal, approvalRequestId: approval.id },
  };
}
