import { canonicalHash } from "./canonical-hash.js";
import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import type { JsonValue } from "./json-types.js";
import type {
  AgentCheckpointV1,
  AgentRunV1,
  AgentTaskStatus,
  AgentTaskV1,
} from "./task-types.js";
import { uuidV7 } from "./uuid-v7.js";
import { createDelegationGrant } from "./delegation-grant.js";
import type { DelegationGrantDraft } from "./delegation-grant.js";
import type { DelegationGrantV1 } from "./grant-types.js";

export class AgentTaskStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public create(conversationId: string, goal: string): Promise<AgentTaskV1> {
    const normalizedGoal = goal.trim();
    if (!conversationId.trim() || !normalizedGoal) {
      return Promise.reject(new Error("AgentTask 必须引用 Conversation 并包含目标"));
    }
    return this.repository.update((state) => {
      const task = buildTask(this.ownerId, conversationId, normalizedGoal);
      state.tasks.push(task);
      return task;
    });
  }

  public provision(input: {
    conversationId: string;
    goal: string;
    grant: Omit<
      DelegationGrantDraft,
      "ownerId" | "taskId" | "taskGoalHash" | "confirmedByUserAt"
    >;
    confirmedByUserAt: string;
  }): Promise<{ task: AgentTaskV1; grant: DelegationGrantV1 }> {
    return this.repository.update((state) => {
      const task = buildTask(this.ownerId, input.conversationId, input.goal.trim());
      const grant = createDelegationGrant({
        ...structuredClone(input.grant), ownerId: this.ownerId,
        taskId: task.id, taskGoalHash: task.goalHash,
        confirmedByUserAt: input.confirmedByUserAt,
      });
      task.grantId = grant.id;
      task.status = "queued";
      task.updatedAt = input.confirmedByUserAt;
      state.tasks.push(task);
      state.grants.push(grant);
      return { task, grant };
    });
  }

  public list(): Promise<AgentTaskV1[]> {
    return this.repository.read((state) =>
      [...state.tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  public get(taskId: string): Promise<AgentTaskV1> {
    return this.repository.read((state) => requireTask(state.tasks, taskId, this.ownerId));
  }

  public findRunningByConversation(
    conversationId: string,
  ): Promise<AgentTaskV1 | null> {
    return this.repository.read((state) => state.tasks.find((task) =>
      task.ownerId === this.ownerId && task.conversationId === conversationId &&
      task.status === "running" && task.activeRunId !== null,
    ) ?? null);
  }

  public startRun(input: {
    taskId: string;
    wakeCause: AgentRunV1["wakeCause"];
    wakeEventIds?: string[];
  }): Promise<AgentRunV1> {
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, input.taskId, this.ownerId);
      if (!task.grantId) throw new Error("AgentTask 尚未获得 DelegationGrant");
      const grant = state.grants.find((candidate) => candidate.id === task.grantId);
      if (!grant || state.revocations.some((value) => value.grantId === grant.id) ||
          Date.parse(grant.expiresAt) <= Date.now()) {
        throw new Error("AgentTask DelegationGrant 不可用");
      }
      if (state.tasks.some((candidate) =>
        candidate.id !== task.id && candidate.status === "running")) {
        throw new Error("当前账号已有运行中的 AgentTask");
      }
      if (["completed", "partially_completed", "failed", "canceled", "expired"]
        .includes(task.status)) throw new Error("终态 AgentTask 不能重新运行");
      const sequence = state.runs.filter((run) => run.taskId === task.id).length + 1;
      const run: AgentRunV1 = {
        version: 1, id: uuidV7(), taskId: task.id, ownerId: this.ownerId,
        sequence, wakeCause: input.wakeCause,
        wakeEventIds: [...new Set(input.wakeEventIds ?? [])], status: "running",
        modelCalls: 0, toolCalls: 0, startedAt: new Date().toISOString(),
        endedAt: null, stopReason: null,
      };
      state.runs.push(run);
      task.status = "running";
      task.activeRunId = run.id;
      task.waiting = null;
      task.updatedAt = run.startedAt;
      return run;
    });
  }

  public recordCheckpoint(
    checkpoint: AgentCheckpointV1,
  ): Promise<AgentCheckpointV1> {
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, checkpoint.taskId, this.ownerId);
      if (checkpoint.ownerId !== this.ownerId || checkpoint.runId !== task.activeRunId ||
          checkpoint.conversationId !== task.conversationId) {
        throw new Error("AgentCheckpoint 与当前 task/run/conversation 不匹配");
      }
      state.checkpoints.push(structuredClone(checkpoint));
      task.latestCheckpointId = checkpoint.id;
      task.updatedAt = checkpoint.createdAt;
      return checkpoint;
    });
  }

  public finishRun(input: {
    taskId: string;
    runId: string;
    taskStatus: "waiting" | "completed" | "partially_completed";
    waiting?: AgentTaskV1["waiting"];
    stopReason: string;
  }): Promise<AgentTaskV1> {
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, input.taskId, this.ownerId);
      const run = state.runs.find((candidate) => candidate.id === input.runId);
      if (!run || task.activeRunId !== run.id || run.status !== "running") {
        throw new Error("AgentRun 不存在或已结束");
      }
      const now = new Date().toISOString();
      run.status = input.taskStatus === "waiting" ? "waiting" : "completed";
      run.endedAt = now;
      run.stopReason = input.stopReason;
      task.status = input.taskStatus;
      task.waiting = input.taskStatus === "waiting" ? input.waiting ?? null : null;
      task.activeRunId = null;
      task.updatedAt = now;
      task.terminalAt = input.taskStatus === "waiting" ? null : now;
      return task;
    });
  }

  public setHostStatus(
    taskId: string,
    status: Extract<AgentTaskStatus, "paused" | "canceled" | "expired" | "failed">,
  ): Promise<AgentTaskV1> {
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, taskId, this.ownerId);
      const now = new Date().toISOString();
      const run = state.runs.find((candidate) => candidate.id === task.activeRunId);
      if (run?.status === "running") {
        run.status = status === "failed" ? "failed" : "canceled";
        run.endedAt = now;
        run.stopReason = `host_${status}`;
      }
      task.status = status;
      task.activeRunId = null;
      task.waiting = null;
      task.updatedAt = now;
      task.terminalAt = status === "paused" ? null : now;
      return task;
    });
  }

  public recoverInterruptedRuns(): Promise<AgentTaskV1[]> {
    return this.repository.update((state) => {
      const recovered: AgentTaskV1[] = [];
      const now = new Date().toISOString();
      for (const task of state.tasks) {
        if (task.ownerId !== this.ownerId || task.status !== "running") continue;
        const run = state.runs.find((candidate) => candidate.id === task.activeRunId);
        if (run?.status === "running") {
          run.status = "canceled";
          run.endedAt = now;
          run.stopReason = "app_restart";
        }
        task.status = "paused";
        task.activeRunId = null;
        task.waiting = null;
        task.updatedAt = now;
        recovered.push(task);
      }
      return recovered;
    });
  }
}

export function requireTask(
  tasks: AgentTaskV1[],
  taskId: string,
  ownerId: string,
): AgentTaskV1 {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task || task.ownerId !== ownerId) throw new Error("AgentTask 不存在或不属于当前用户");
  return task;
}

function buildTask(
  ownerId: string,
  conversationId: string,
  goal: string,
): AgentTaskV1 {
  if (!conversationId.trim() || !goal) {
    throw new Error("AgentTask 必须引用 Conversation 并包含目标");
  }
  const now = new Date().toISOString();
  return {
    version: 1, id: uuidV7(), ownerId, conversationId,
    capabilityProfile: "browser_enhance", goal,
    goalHash: canonicalHash(goal as JsonValue), grantId: null,
    status: "awaiting_consent", waiting: null, activeRunId: null,
    latestCheckpointId: null, createdAt: now, updatedAt: now, terminalAt: null,
  };
}
