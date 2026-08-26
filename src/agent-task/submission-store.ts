import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import type { SubmissionIntentV1, SubmissionReceiptV1 } from "./submission-types.js";
import { requireTask } from "./agent-task-store.js";
import { uuidV7 } from "./uuid-v7.js";

export class SubmissionStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public createIntent(
    input: Omit<
      SubmissionIntentV1,
      "version" | "id" | "ownerId" | "startedAt" | "submissionReceiptId"
    >,
  ): Promise<SubmissionIntentV1> {
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, input.taskId, this.ownerId);
      if (task.activeRunId !== input.runId) throw new Error("SubmissionIntent run 不匹配");
      const intent: SubmissionIntentV1 = {
        version: 1, id: uuidV7(), ownerId: this.ownerId,
        ...structuredClone(input), startedAt: null, submissionReceiptId: null,
      };
      state.submissionIntents.push(intent);
      return intent;
    });
  }

  public claimIntent(intentId: string, startedAt: string): Promise<{
    intent: SubmissionIntentV1;
    claimed: boolean;
  }> {
    return this.repository.update((state) => {
      const intent = state.submissionIntents.find((value) => value.id === intentId);
      if (!intent || intent.ownerId !== this.ownerId) {
        throw new Error("SubmissionIntent 不存在或不属于当前用户");
      }
      if (intent.submissionReceiptId || intent.startedAt) {
        return { intent, claimed: false };
      }
      intent.startedAt = startedAt;
      return { intent, claimed: true };
    });
  }

  public getIntent(intentId: string): Promise<SubmissionIntentV1> {
    return this.repository.read((state) => {
      const intent = state.submissionIntents.find((value) => value.id === intentId);
      if (!intent || intent.ownerId !== this.ownerId) {
        throw new Error("SubmissionIntent 不存在或不属于当前用户");
      }
      return intent;
    });
  }

  public createReceipt(
    input: Omit<SubmissionReceiptV1, "version" | "id" | "ownerId">,
  ): Promise<SubmissionReceiptV1> {
    return this.repository.update((state) => {
      const intent = state.submissionIntents.find((value) => value.id === input.intentId);
      if (!intent || intent.ownerId !== this.ownerId) throw new Error("SubmissionIntent 已失效");
      if (intent.submissionReceiptId) {
        const existing = state.submissionReceipts.find((value) =>
          value.id === intent.submissionReceiptId);
        if (!existing) throw new Error("SubmissionReceipt 引用缺失");
        return existing;
      }
      const receipt: SubmissionReceiptV1 = {
        version: 1, id: uuidV7(), ownerId: this.ownerId, ...structuredClone(input),
      };
      state.submissionReceipts.push(receipt);
      intent.submissionReceiptId = receipt.id;
      return receipt;
    });
  }

  public linkApplication(
    receiptId: string,
    applicationId: string,
  ): Promise<SubmissionReceiptV1> {
    return this.repository.update((state) => {
      const receipt = state.submissionReceipts.find((value) => value.id === receiptId);
      if (!receipt || receipt.ownerId !== this.ownerId) throw new Error("SubmissionReceipt 不存在");
      if (receipt.applicationId && receipt.applicationId !== applicationId) {
        throw new Error("SubmissionReceipt 已关联其他 Application");
      }
      receipt.applicationId = applicationId;
      return receipt;
    });
  }

  public list(taskId: string): Promise<SubmissionReceiptV1[]> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      return state.submissionReceipts.filter((value) => value.taskId === taskId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  public findByApplication(
    applicationId: string,
  ): Promise<SubmissionReceiptV1 | undefined> {
    return this.repository.read((state) => state.submissionReceipts.find((value) =>
      value.ownerId === this.ownerId && value.applicationId === applicationId));
  }

  public deleteByApplication(applicationId: string): Promise<void> {
    return this.repository.update((state) => {
      const receiptIds = new Set(state.submissionReceipts
        .filter((value) => value.applicationId === applicationId)
        .map((value) => value.id));
      state.submissionReceipts = state.submissionReceipts
        .filter((value) => !receiptIds.has(value.id));
      state.submissionIntents = state.submissionIntents
        .filter((value) => !value.submissionReceiptId ||
          !receiptIds.has(value.submissionReceiptId));
    });
  }
}
