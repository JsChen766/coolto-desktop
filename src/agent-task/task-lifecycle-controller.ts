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
    await this.services.leads.assertAllOpenLeadsEvaluated(task.id);
    await this.services.signals.assertAllMailEventsClassified(task.id);
    await this.checkpoint({ summary: input.summary });
    return this.services.tasks.finishRun({
      taskId: task.id, runId: task.activeRunId!, taskStatus: "waiting",
      waiting: {
        reason: input.reason,
        wakeAfter: input.wakeAfter ?? null,
        eventTypes: [...new Set(input.eventTypes ?? [])],
      },
      stopReason: input.summary,
    });
  }

  public async complete(input: {
    partial: boolean;
    summary: string;
  }): Promise<AgentTaskV1> {
    const task = await this.#runningTask();
    await this.services.leads.assertAllOpenLeadsEvaluated(task.id);
    await this.services.signals.assertAllMailEventsClassified(task.id);
    await this.checkpoint({ summary: input.summary });
    return this.services.tasks.finishRun({
      taskId: task.id, runId: task.activeRunId!,
      taskStatus: input.partial ? "partially_completed" : "completed",
      stopReason: input.summary,
    });
  }

  async #runningTask(): Promise<AgentTaskV1> {
    const task = await this.services.tasks.findRunningByConversation(
      this.conversationId,
    );
    if (!task?.activeRunId) throw new Error("当前 Conversation 没有 running AgentTask");
    return task;
  }
}
