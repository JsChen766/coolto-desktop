import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import type { ActionReceiptV1, ActionTokenV1 } from "./receipt-types.js";
import { requireTask } from "./agent-task-store.js";
import { uuidV7 } from "./uuid-v7.js";

export type ActionTokenDraft = Omit<
  ActionTokenV1,
  "version" | "id" | "consumedAt" | "receiptId"
>;

export interface ConsumeActionInput {
  tokenId: string;
  toolCallId: string;
  targetOrigin: string | null;
  tabId: string | null;
  observationHash: string | null;
  status: ActionReceiptV1["status"];
  observationAfterHash: string | null;
  evidenceRefs?: string[];
  proposalId?: string | null;
  errorCode?: string | null;
}

export interface RecordActionReceiptInput {
  taskId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  requestHash: string;
  targetOrigin: string | null;
  status: ActionReceiptV1["status"];
  observationBeforeHash?: string | null;
  observationAfterHash?: string | null;
  errorCode?: string | null;
}

export class ActionLedger {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public issue(draft: ActionTokenDraft): Promise<ActionTokenV1> {
    if (draft.ownerId !== this.ownerId) {
      return Promise.reject(new Error("ActionToken owner 不匹配"));
    }
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, draft.taskId, this.ownerId);
      if (task.activeRunId !== draft.runId || task.status !== "running") {
        throw new Error("ActionToken 只能绑定当前 running AgentRun");
      }
      const grant = state.grants.find((candidate) => candidate.id === task.grantId);
      const revoked = state.revocations.some((value) => value.grantId === grant?.id);
      if (!grant || revoked || grant.contentHash !== draft.grantHash) {
        throw new Error("ActionToken grant 不存在、已撤销或 hash 不匹配");
      }
      const expiresAt = Date.parse(draft.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
          expiresAt - Date.now() > 5 * 60_000) {
        throw new Error("ActionToken 有效期必须在未来 5 分钟内");
      }
      const token: ActionTokenV1 = {
        version: 1, id: uuidV7(), ...structuredClone(draft),
        consumedAt: null, receiptId: null,
      };
      state.actionTokens.push(token);
      return token;
    });
  }

  public consume(input: ConsumeActionInput): Promise<ActionReceiptV1> {
    return this.repository.update((state) => {
      const token = state.actionTokens.find((candidate) => candidate.id === input.tokenId);
      if (!token || token.ownerId !== this.ownerId) {
        throw new Error("ActionToken 不存在或不属于当前用户");
      }
      if (token.receiptId) {
        const receipt = state.actionReceipts.find((value) => value.id === token.receiptId);
        if (!receipt) throw new Error("ActionToken 已消费但 receipt 缺失");
        return receipt;
      }
      const task = requireTask(state.tasks, token.taskId, this.ownerId);
      const mismatch = task.status !== "running" || task.activeRunId !== token.runId ||
        Date.now() >= Date.parse(token.expiresAt) ||
        token.targetOrigin !== input.targetOrigin || token.tabId !== input.tabId ||
        token.observationHash !== input.observationHash;
      if (!mismatch) {
        const duplicate = state.actionReceipts.find((receipt) =>
          receipt.taskId === token.taskId && receipt.runId === token.runId &&
          receipt.requestHash === token.requestHash,
        );
        if (duplicate) {
          token.consumedAt = new Date().toISOString();
          token.receiptId = duplicate.id;
          return duplicate;
        }
      }
      const receipt = createReceipt(this.ownerId, token, input, mismatch);
      state.actionReceipts.push(receipt);
      token.consumedAt = receipt.createdAt;
      token.receiptId = receipt.id;
      return receipt;
    });
  }

  public listReceipts(taskId: string): Promise<ActionReceiptV1[]> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      return state.actionReceipts.filter((receipt) => receipt.taskId === taskId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }

  public record(input: RecordActionReceiptInput): Promise<ActionReceiptV1> {
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, input.taskId, this.ownerId);
      if (task.activeRunId !== input.runId) {
        throw new Error("ActionReceipt 必须绑定当前 AgentRun");
      }
      const existing = state.actionReceipts.find((receipt) =>
        receipt.taskId === input.taskId && receipt.runId === input.runId &&
        receipt.toolCallId === input.toolCallId,
      );
      if (existing) return existing;
      const receipt: ActionReceiptV1 = {
        version: 1, id: uuidV7(), ownerId: this.ownerId,
        taskId: input.taskId, runId: input.runId,
        toolCallId: input.toolCallId, toolName: input.toolName,
        requestHash: input.requestHash, targetOrigin: input.targetOrigin,
        status: input.status,
        observationBeforeHash: input.observationBeforeHash ?? null,
        observationAfterHash: input.observationAfterHash ?? null,
        evidenceRefs: [], proposalId: null, errorCode: input.errorCode ?? null,
        createdAt: new Date().toISOString(),
      };
      state.actionReceipts.push(receipt);
      return receipt;
    });
  }

  public reconcileInvalidatedRun(
    taskId: string,
    runId: string,
    errorCode: string,
  ): Promise<ActionReceiptV1[]> {
    return this.repository.update((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      const receipts: ActionReceiptV1[] = [];
      for (const token of state.actionTokens) {
        if (token.taskId !== taskId || token.runId !== runId || token.receiptId) continue;
        const receipt = createReceipt(this.ownerId, token, {
          tokenId: token.id,
          toolCallId: `interrupted:${token.id}`,
          targetOrigin: token.targetOrigin,
          tabId: token.tabId,
          observationHash: token.observationHash,
          status: "uncertain",
          observationAfterHash: null,
          errorCode,
        }, false);
        state.actionReceipts.push(receipt);
        token.consumedAt = receipt.createdAt;
        token.receiptId = receipt.id;
        receipts.push(receipt);
      }
      return receipts;
    });
  }
}

function createReceipt(
  ownerId: string,
  token: ActionTokenV1,
  input: ConsumeActionInput,
  mismatch: boolean,
): ActionReceiptV1 {
  return {
    version: 1, id: uuidV7(), ownerId, taskId: token.taskId, runId: token.runId,
    toolCallId: input.toolCallId, toolName: token.toolName,
    requestHash: token.requestHash, targetOrigin: input.targetOrigin,
    status: mismatch ? "blocked" : input.status,
    observationBeforeHash: token.observationHash,
    observationAfterHash: input.observationAfterHash,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])],
    proposalId: input.proposalId ?? null,
    errorCode: mismatch ? "action_token_context_mismatch_or_expired" : input.errorCode ?? null,
    createdAt: new Date().toISOString(),
  };
}
