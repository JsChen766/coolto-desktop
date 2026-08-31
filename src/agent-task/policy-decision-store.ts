import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import type { PolicyDecisionV1 } from "./grant-types.js";

export class PolicyDecisionStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public record(
    taskId: string,
    decision: PolicyDecisionV1,
  ): Promise<PolicyDecisionV1> {
    return this.repository.update((state) => {
      const task = state.tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.ownerId !== this.ownerId) {
        throw new Error("PolicyDecision task 不存在或不属于当前用户");
      }
      if (decision.ownerId !== this.ownerId || decision.taskId !== taskId) {
        throw new Error("PolicyDecision owner/task 不匹配");
      }
      state.policyDecisions.push(structuredClone(decision));
      return decision;
    });
  }

  public recordIfActiveRun(
    taskId: string,
    runId: string,
    decision: PolicyDecisionV1,
  ): Promise<boolean> {
    return this.repository.update((state) => {
      const task = state.tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.ownerId !== this.ownerId ||
          decision.ownerId !== this.ownerId || decision.taskId !== taskId ||
          decision.runId !== runId) {
        throw new Error("PolicyDecision owner/task/run 不匹配");
      }
      if (task.status !== "running" || task.activeRunId !== runId) return false;
      state.policyDecisions.push(structuredClone(decision));
      return true;
    });
  }

  public list(taskId: string): Promise<PolicyDecisionV1[]> {
    return this.repository.read((state) => state.policyDecisions
      .filter((decision) =>
        decision.taskId === taskId && decision.ownerId === this.ownerId)
      .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt)));
  }
}
