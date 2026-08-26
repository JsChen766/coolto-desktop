import { uuidV7 } from "../../../agent-task/uuid-v7.js";
import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import type {
  InboxApplicationProposalResult,
  InboxApplicationProposalView,
} from "../../../inbox-signals/inbox-action-types.js";
import type { ApplicationRecord, ApplicationStatus, ApplicationUpdateInput } from "../../../tracker/types.js";
import { canTransitionApplication } from "../../../tracker/application-status.js";
import type { ApplicationSyncStore } from "../application-library/application-sync-store.js";

interface StoredProposal {
  view: InboxApplicationProposalView;
  executed: InboxApplicationProposalResult | null;
}

export class InboxSignalApplicationService {
  readonly #proposals = new Map<string, StoredProposal>();

  public constructor(
    private readonly conversationId: string,
    private readonly harness: AgentHarnessServices,
    private readonly applications: ApplicationSyncStore,
  ) {}

  public async prepare(signalId: string): Promise<InboxApplicationProposalView> {
    const task = await this.#runningTask();
    const signal = await this.harness.signals.get(task.id, signalId);
    if (!signal.applicationId) throw new Error("邮件信号尚未可靠关联 Application");
    if (signal.status === "ignored") throw new Error("忽略的邮件信号不能推进 Tracker");
    const application = await this.applications.getApplication(signal.applicationId);
    const action = actionFor(signal.kind, application);
    const view: InboxApplicationProposalView = {
      id: uuidV7(), taskId: task.id, signalId: signal.id,
      signalContentHash: signal.contentHash, applicationId: application.id,
      applicationVersion: application.entityVersion,
      companyName: application.companyName, roleName: application.roleName,
      subject: signal.subject, sender: signal.sender,
      confidence: signal.confidence, evidenceQuotes: signal.evidenceQuotes,
      currentStatus: application.status, targetStatus: action.targetStatus,
      clearPendingConfirmation: action.clearPendingConfirmation,
      preparedAt: new Date().toISOString(),
    };
    this.#proposals.set(view.id, { view: structuredClone(view), executed: null });
    await this.harness.signals.markStatus(
      task.id, signal.id, signal.contentHash, "proposed",
    );
    return structuredClone(view);
  }

  public async execute(proposalId: string): Promise<InboxApplicationProposalResult> {
    const stored = this.#proposals.get(proposalId);
    if (!stored) throw new Error("Inbox Tracker Proposal 不存在或已失效");
    if (stored.executed) return structuredClone(stored.executed);
    const view = stored.view;
    const [signal, current] = await Promise.all([
      this.harness.signals.get(view.taskId, view.signalId),
      this.applications.getApplication(view.applicationId),
    ]);
    if (signal.contentHash !== view.signalContentHash ||
        current.entityVersion !== view.applicationVersion ||
        current.status !== view.currentStatus) {
      throw new Error("邮件信号或 Application 已变化，请重新检查");
    }
    let application: ApplicationRecord;
    if (view.clearPendingConfirmation) {
      application = await this.applications.updateApplication(
        current.id, applicationUpdate(current, false),
      );
    } else if (view.targetStatus) {
      application = await this.applications.transitionApplication(current.id, {
        toStatus: view.targetStatus,
        occurredAt: signal.receivedAt,
        reason: `Inbox signal ${signal.id}: ${signal.rationale}`,
      });
    } else {
      throw new Error("Inbox Tracker Proposal 没有可执行变更");
    }
    await this.harness.signals.markStatus(
      view.taskId, signal.id, signal.contentHash, "applied",
    );
    const result = { proposalId, signalId: signal.id, application };
    stored.executed = structuredClone(result);
    return result;
  }

  async #runningTask() {
    const task = await this.harness.tasks.findRunningByConversation(this.conversationId);
    if (!task?.activeRunId) throw new Error("Inbox Tracker Proposal 需要 running AgentTask");
    return task;
  }
}

function actionFor(
  kind: string,
  application: ApplicationRecord,
): { targetStatus: ApplicationStatus | null; clearPendingConfirmation: boolean } {
  if (kind === "application_confirmation") {
    if (!application.pendingConfirmation) throw new Error("Application 已经是确认投递状态");
    return { targetStatus: null, clearPendingConfirmation: true };
  }
  const targets: Record<string, ApplicationStatus> = {
    screening: "screening", interview_invite: "interviewing",
    offer: "offer", rejection: "rejected",
  };
  const targetStatus = targets[kind];
  if (!targetStatus) throw new Error("该邮件信号需要 Interview 专用 Proposal 或人工处理");
  if (application.status === targetStatus) throw new Error("Application 已处于目标状态");
  if (!canTransitionApplication(application.status, targetStatus)) {
    throw new Error(`邮件信号不能触发非法状态迁移：${application.status} → ${targetStatus}`);
  }
  return { targetStatus, clearPendingConfirmation: false };
}

function applicationUpdate(
  value: ApplicationRecord,
  pendingConfirmation: boolean,
): ApplicationUpdateInput {
  return {
    jdId: value.jdId, resumeId: value.resumeId,
    ...(value.resumeContentHashSnapshot
      ? { resumeContentHashSnapshot: value.resumeContentHashSnapshot } : {}),
    companyName: value.companyName, roleName: value.roleName,
    deliveryMethod: value.deliveryMethod, targetUrl: value.targetUrl,
    appliedAt: value.appliedAt, pendingConfirmation,
    companyBusiness: value.companyBusiness, roleSummary: value.roleSummary,
    companyCulture: value.companyCulture, rejectionReason: value.rejectionReason,
  };
}
