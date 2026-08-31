import type { AgentHarnessServices } from "./agent-harness-services.js";
import type { AgentCheckpointV1, AgentTaskV1 } from "./task-types.js";
import { uuidV7 } from "./uuid-v7.js";

export interface TaskCheckpointInput {
  summary: string;
}

export class TaskLifecycleController {
  public constructor(
    private readonly conversationId: string,
    private readonly services: AgentHarnessServices,
    private readonly revokeBrowserAccess: (reason: string) => void = () => undefined,
  ) {}

  public async checkpoint(
    _input: TaskCheckpointInput,
  ): Promise<AgentCheckpointV1> {
    const task = await this.#runningTask();
    const active = await this.services.grants.getActive(task.id);
    if (!active.grant || active.revocation) {
      throw new Error("当前 AgentTask grant 不可用");
    }
    const events = await this.services.events.pending(task.id);
    const delivered = events.filter((event) => event.status === "delivered");
    const receipts = await this.services.ledger.listReceipts(task.id);
    const now = new Date().toISOString();
    const checkpoint: AgentCheckpointV1 = {
      version: 1, id: uuidV7(), ownerId: task.ownerId, taskId: task.id,
      runId: task.activeRunId!, conversationId: this.conversationId,
      lastMessageTimestamp: null, conversationUpdatedAt: now,
      grantHash: active.grant.contentHash,
      lastAcknowledgedEventId: delivered.at(-1)?.id ?? null,
      receiptCursor: receipts.at(-1)?.id ?? null,
      browserRefs: [], createdAt: now,
    };
    await this.services.tasks.recordCheckpoint(checkpoint);
    for (const event of delivered) await this.services.events.acknowledge(event.id);
    return checkpoint;
  }

  public async wait(input: {
    reason: NonNullable<AgentTaskV1["waiting"]>["reason"];
    wakeAfter?: string | null;
    eventTypes?: string[];
    summary: string;
  }): Promise<AgentTaskV1> {
    const task = await this.#runningTask();
    const runId = task.activeRunId!;
    const wakeAfter = normalizeWakeAfter(input.reason, input.wakeAfter);
    await this.services.leads.assertAllOpenLeadsEvaluated(task.id);
    await this.services.signals.assertAllMailEventsClassified(task.id);
    await this.checkpoint({ summary: input.summary });
    const waiting = await this.services.tasks.finishRun({
      taskId: task.id, runId, taskStatus: "waiting",
      waiting: {
        reason: input.reason,
        wakeAfter,
        eventTypes: [...new Set(input.eventTypes ?? [])],
      },
      stopReason: input.summary,
    });
    this.services.runtimeProjection.clearTask(task.id, runId);
    this.revokeBrowserAccess("task_waiting");
    await this.services.ledger.reconcileInvalidatedRun(
      task.id, runId, "task_waiting_before_receipt",
    );
    return waiting;
  }

  public async complete(input: {
    partial: boolean;
    summary: string;
  }): Promise<AgentTaskV1> {
    const task = await this.#runningTask();
    const runId = task.activeRunId!;
    await this.services.leads.assertAllOpenLeadsEvaluated(task.id);
    await this.services.signals.assertAllMailEventsClassified(task.id);
    await this.checkpoint({ summary: input.summary });
    const completed = await this.services.tasks.finishRun({
      taskId: task.id, runId,
      taskStatus: input.partial ? "partially_completed" : "completed",
      stopReason: input.summary,
    });
    this.services.runtimeProjection.clearTask(task.id, runId);
    this.revokeBrowserAccess(`task_${completed.status}`);
    await this.services.ledger.reconcileInvalidatedRun(
      task.id, runId, `task_${completed.status}_before_receipt`,
    );
    return completed;
  }

  async #runningTask(): Promise<AgentTaskV1> {
    const task = await this.services.tasks.findRunningByConversation(
      this.conversationId,
    );
    if (!task?.activeRunId) throw new Error("当前 Conversation 没有 running AgentTask");
    return task;
  }
}

function normalizeWakeAfter(
  reason: NonNullable<AgentTaskV1["waiting"]>["reason"],
  value: string | null | undefined,
): string | null {
  if (reason !== "timer") return value ?? null;
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new Error("timer 等待必须提供未来的 wakeAfter");
  }
  return new Date(timestamp).toISOString();
}
