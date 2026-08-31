import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import { uuidV7 } from "../../../agent-task/uuid-v7.js";
import type { InboxInterviewProposalView } from "../../../inbox-signals/inbox-action-types.js";
import type { InterviewInput, InterviewRound } from "../../../tracker/child-types.js";
import type { ApplicationSyncStore } from "../application-library/application-sync-store.js";
import type { InterviewProposalService } from "../tracker/interview-proposal-service.js";
import type { InterviewSyncStore } from "../tracker/interview-sync-store.js";
import { validateInterview } from "../tracker/interview-sync-mapping.js";

interface StoredProposal {
  view: InboxInterviewProposalView;
  result: InterviewRound | null;
}

export class InboxSignalInterviewService {
  readonly #proposals = new Map<string, StoredProposal>();
  public constructor(
    private readonly conversationId: string,
    private readonly harness: AgentHarnessServices,
    private readonly applications: ApplicationSyncStore,
    private readonly interviews: InterviewSyncStore,
    private readonly interviewProposals: InterviewProposalService,
  ) {}

  public async prepare(input: {
    signalId: string; mutation: "create" | "update";
    interviewId?: string | null; value: InterviewInput;
  }): Promise<InboxInterviewProposalView> {
    const task = await this.#runningTask();
    const signal = await this.harness.signals.get(task.id, input.signalId);
    const active = await this.harness.grants.getActive(task.id);
    const directions = active.grant?.connectorPolicy?.scheduleMailDirections;
    if (!active.grant || active.revocation ||
        active.grant.connectorPolicy?.appSchedule !== true ||
        !Array.isArray(directions) || !directions.includes(signal.direction)) {
      throw new Error("DelegationGrant 未授权该收/发件方向写入 App 日程");
    }
    if (!signal.applicationId) throw new Error("邮件信号尚未可靠关联 Application");
    const application = await this.applications.getApplication(signal.applicationId);
    if (application.status !== "interviewing") {
      throw new Error("请先确认 Application 已进入 interviewing，再准备 Interview Proposal");
    }
    assertMutation(signal.kind, input.mutation, input.interviewId);
    const next = validateInterview(input.value);
    if (input.mutation === "create" && (!next.scheduledAt || !next.timezone.trim())) {
      throw new Error("面试邀请缺少完整时间或时区，必须先询问用户");
    }
    const current = input.mutation === "update"
      ? await this.interviews.get(input.interviewId!) : null;
    if (current && current.applicationId !== application.id) {
      throw new Error("InterviewRound 不属于邮件关联的 Application");
    }
    const view: InboxInterviewProposalView = {
      id: uuidV7(), taskId: task.id, signalId: signal.id,
      signalContentHash: signal.contentHash, applicationId: application.id,
      companyName: application.companyName, roleName: application.roleName,
      subject: signal.subject, sender: signal.sender,
      confidence: signal.confidence, evidenceQuotes: signal.evidenceQuotes,
      mutation: input.mutation, interviewId: current?.id ?? null,
      current, next: structuredClone(next), preparedAt: new Date().toISOString(),
    };
    this.#proposals.set(view.id, { view: structuredClone(view), result: null });
    await this.harness.signals.markStatus(task.id, signal.id, signal.contentHash, "proposed");
    return structuredClone(view);
  }

  public async execute(proposalId: string): Promise<InterviewRound> {
    const stored = this.#proposals.get(proposalId);
    if (!stored) throw new Error("Inbox Interview Proposal 不存在或已失效");
    if (stored.result) return structuredClone(stored.result);
    const view = stored.view;
    const signal = await this.harness.signals.get(view.taskId, view.signalId);
    if (signal.contentHash !== view.signalContentHash) {
      throw new Error("ExternalSignal 已变化，请重新检查");
    }
    const child = view.mutation === "create"
      ? await this.interviewProposals.prepareCreate(view.applicationId, view.next)
      : await this.interviewProposals.prepareUpdate(view.interviewId!, view.next);
    const result = await this.interviewProposals.execute(child.id);
    if (!("applicationId" in result)) throw new Error("Interview Proposal 意外返回删除结果");
    await this.harness.signals.markStatus(
      view.taskId, signal.id, signal.contentHash, "applied",
    );
    stored.result = structuredClone(result);
    return result;
  }

  async #runningTask() {
    const task = await this.harness.tasks.findRunningByConversation(this.conversationId);
    if (!task?.activeRunId) throw new Error("Inbox Interview Proposal 需要 running AgentTask");
    return task;
  }

}

function assertMutation(
  kind: string,
  mutation: "create" | "update",
  interviewId?: string | null,
): void {
  if (mutation === "create" &&
      kind !== "interview_invite" && kind !== "interview_schedule") {
    throw new Error("只有 interview_invite/interview_schedule 可以创建 InterviewRound");
  }
  if (mutation === "update" && (kind !== "interview_change" || !interviewId)) {
    throw new Error("interview_change 必须指定原 InterviewRound");
  }
}
