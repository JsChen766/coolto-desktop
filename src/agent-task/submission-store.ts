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
      "version" | "id" | "ownerId" | "confirmedByUserAt" |
      "rejectedByUserAt" | "startedAt" | "submissionReceiptId"
    >,
  ): Promise<SubmissionIntentV1> {
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, input.taskId, this.ownerId);
      if (task.activeRunId !== input.runId) throw new Error("SubmissionIntent run 不匹配");
      const intent: SubmissionIntentV1 = {
        version: 1, id: uuidV7(), ownerId: this.ownerId,
        ...structuredClone(input), confirmedByUserAt: null, rejectedByUserAt: null,
        startedAt: null, submissionReceiptId: null,
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
      if (!intent.confirmedByUserAt || intent.rejectedByUserAt ||
          !intent.actionTokenId) {
        throw new Error("SubmissionIntent 尚未获得本次投递确认");
      }
      intent.startedAt = startedAt;
      return { intent, claimed: true };
    });
  }

  public confirmIntent(intentId: string, confirmedAt: string): Promise<SubmissionIntentV1> {
    return this.#resolveIntent(intentId, "confirmedByUserAt", confirmedAt);
  }

  public rejectIntent(intentId: string, rejectedAt: string): Promise<SubmissionIntentV1> {
    return this.#resolveIntent(intentId, "rejectedByUserAt", rejectedAt);
  }

  public authorizeIntent(input: {
    intentId: string; runId: string; actionTokenId: string; expiresAt: string;
  }): Promise<SubmissionIntentV1> {
    return this.repository.update((state) => {
      const intent = state.submissionIntents.find((item) => item.id === input.intentId);
      if (!intent || intent.ownerId !== this.ownerId) throw new Error("SubmissionIntent 不存在");
      if (!intent.confirmedByUserAt || intent.rejectedByUserAt ||
          intent.startedAt || intent.submissionReceiptId) {
        throw new Error("SubmissionIntent 当前不能签发提交令牌");
      }
      const task = requireTask(state.tasks, intent.taskId, this.ownerId);
      if (task.activeRunId !== input.runId) throw new Error("SubmissionIntent run 不匹配");
      intent.runId = input.runId;
      intent.actionTokenId = input.actionTokenId;
      intent.expiresAt = input.expiresAt;
      return intent;
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
  public getReceipt(receiptId: string): Promise<SubmissionReceiptV1> {
    return this.repository.read((state) => {
      const receipt = state.submissionReceipts.find((value) => value.id === receiptId);
      const intent = receipt && state.submissionIntents.find((value) =>
        value.id === receipt.intentId);
      if (!receipt || receipt.ownerId !== this.ownerId || !intent ||
          intent.ownerId !== this.ownerId || intent.taskId !== receipt.taskId) {
        throw new Error("SubmissionReceipt 不存在或与 SubmissionIntent 不匹配");
      }
      return receipt;
    });
  }
  public getReceiptForConversation(
    receiptId: string,
    conversationId: string,
    currentTaskId: string,
  ): Promise<{ receipt: SubmissionReceiptV1; intent: SubmissionIntentV1 }> {
    return this.repository.read((state) => {
      const receipt = state.submissionReceipts.find((value) => value.id === receiptId);
      const intent = receipt && state.submissionIntents.find((value) =>
        value.id === receipt.intentId);
      if (!receipt || receipt.ownerId !== this.ownerId || !intent ||
          intent.ownerId !== this.ownerId || intent.taskId !== receipt.taskId ||
          intent.submissionReceiptId !== receipt.id || intent.runId !== receipt.runId) {
        throw new Error("SubmissionReceipt 不存在或与 SubmissionIntent 不匹配");
      }
      const task = requireTask(state.tasks, receipt.taskId, this.ownerId);
      if (task.id !== currentTaskId || task.conversationId !== conversationId) {
        throw new Error("SubmissionReceipt 与当前 AgentTask/Conversation 不一致");
      }
      return { receipt, intent };
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
  public confirmReceipt(
    receiptId: string,
    confirmedAt: string,
  ): Promise<SubmissionReceiptV1> {
    return this.repository.update((state) => {
      const receipt = state.submissionReceipts.find((value) => value.id === receiptId);
      if (!receipt || receipt.ownerId !== this.ownerId) {
        throw new Error("SubmissionReceipt 不存在");
      }
      if (receipt.status === "pending") receipt.userConfirmedAt ??= confirmedAt;
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

  #resolveIntent(
    intentId: string,
    field: "confirmedByUserAt" | "rejectedByUserAt",
    value: string,
  ): Promise<SubmissionIntentV1> {
    return this.repository.update((state) => {
      const intent = state.submissionIntents.find((item) => item.id === intentId);
      if (!intent || intent.ownerId !== this.ownerId) {
        throw new Error("SubmissionIntent 不存在或不属于当前用户");
      }
      if (intent.startedAt || intent.submissionReceiptId) {
        throw new Error("SubmissionIntent 已开始提交，不能再次确认");
      }
      const opposite = field === "confirmedByUserAt"
        ? intent.rejectedByUserAt : intent.confirmedByUserAt;
      if (opposite) throw new Error("SubmissionIntent 已有相反的用户决定");
      intent[field] ??= value;
      return intent;
    });
  }
}
