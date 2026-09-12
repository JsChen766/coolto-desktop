import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import { canonicalHash } from "../../../agent-task/canonical-hash.js";
import type { JsonValue } from "../../../agent-task/json-types.js";
import type {
  SubmissionIntentV1,
  SubmissionReceiptV1,
} from "../../../agent-task/submission-types.js";
import type {
  ApplicationRecord,
  ApplicationTombstone,
} from "../../../tracker/types.js";
import type { ApplicationProposalService } from "../application-library/application-proposal-service.js";
import { createApplicationInput } from "./submission-application-input.js";

export class SubmissionReceiptRecovery {
  public constructor(
    private readonly conversationId: string,
    private readonly harness: AgentHarnessServices,
    private readonly applications: ApplicationProposalService,
  ) {}

  public async existingReceipt(
    intent: SubmissionIntentV1,
  ): Promise<SubmissionReceiptV1 | undefined> {
    if (!intent.submissionReceiptId) return undefined;
    return (await this.harness.submissions.list(intent.taskId))
      .find((value) => value.id === intent.submissionReceiptId);
  }

  public async syncToTracker(
    intent: SubmissionIntentV1,
    receipt: SubmissionReceiptV1,
  ): Promise<SubmissionReceiptV1> {
    if (receipt.applicationId) return receipt;
    if (receipt.status === "pending" && !receipt.userConfirmedAt) return receipt;
    if (receipt.status !== "confirmed" && receipt.status !== "pending") return receipt;
    const existing = await this.applications.findExistingBySubmissionKey({
      dedupeKey: canonicalHash({
        jdId: intent.jdId, resumeId: intent.resumeId, targetUrl: intent.targetUrl,
      } as JsonValue),
      jdId: intent.jdId, resumeId: intent.resumeId,
      resumeContentHash: intent.resumeContentHash,
    });
    const application = existing ?? await this.#createFreshApplication(intent);
    return this.harness.submissions.linkApplication(receipt.id, application.id);
  }

  public async syncReceipt(receiptId: string): Promise<SubmissionReceiptV1> {
    const { receipt, intent } = await this.#receiptForCurrentTask(receiptId);
    return this.syncToTracker(intent, receipt);
  }

  public async confirmReceipt(
    receiptId: string,
    taskId: string,
  ): Promise<SubmissionReceiptV1> {
    const { receipt, intent } = await this.#receiptForCurrentTask(receiptId);
    if (receipt.taskId !== taskId) {
      throw new Error("SubmissionReceipt 与 Approval task 不一致");
    }
    const confirmed = await this.harness.submissions.confirmReceipt(
      receipt.id, new Date().toISOString(),
    );
    return this.syncToTracker(intent, confirmed);
  }

  public async assertReceiptAuthority(
    receiptId: string,
  ): Promise<{ taskId: string }> {
    const task = await this.harness.tasks.findRunningByConversation(
      this.conversationId,
    );
    if (!task?.activeRunId) {
      throw new Error("SubmissionReceipt 与当前 AgentTask/Conversation 不一致");
    }
    await this.harness.submissions.getReceiptForConversation(
      receiptId, this.conversationId, task.id,
    );
    return { taskId: task.id };
  }

  async #receiptForCurrentTask(
    receiptId: string,
  ): Promise<{ receipt: SubmissionReceiptV1; intent: SubmissionIntentV1 }> {
    const receipt = await this.harness.submissions.getReceipt(receiptId);
    const task = await this.harness.tasks.get(receipt.taskId);
    const active = await this.harness.tasks.findRunningByConversation(
      this.conversationId,
    );
    const running = task.status === "running" &&
      task.activeRunId !== null && active?.id === task.id;
    const approvalWaiting = task.status === "waiting" &&
      task.waiting?.reason === "approval" && !active;
    if (!running && !approvalWaiting) {
      throw new Error("SubmissionReceipt 与当前 AgentTask/Conversation 不一致");
    }
    return this.harness.submissions.getReceiptForConversation(
      receiptId, this.conversationId, task.id,
    );
  }

  async #createFreshApplication(
    intent: SubmissionIntentV1,
  ): Promise<ApplicationRecord | ApplicationTombstone> {
    const proposal = await this.applications.prepareCreate(createApplicationInput({
      jdId: intent.jdId, resumeId: intent.resumeId,
      company: intent.company, role: intent.role, targetUrl: intent.targetUrl,
    }));
    if (proposal.duplicate ||
        proposal.resumeContentHashSnapshot !== intent.resumeContentHash) {
      throw new Error("投递恢复资产已变化或已有重复记录，请重新检查后再确认");
    }
    return this.applications.execute(proposal.id);
  }
}
