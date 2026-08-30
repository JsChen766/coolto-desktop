import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import {
  createDelegationGrant,
  type DelegationGrantDraft,
  verifyDelegationGrant,
} from "./delegation-grant.js";
import type { DelegationGrantV1, GrantRevocationV1 } from "./grant-types.js";
import { requireTask } from "./agent-task-store.js";

export class DelegationGrantStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public create(draft: DelegationGrantDraft): Promise<DelegationGrantV1> {
    if (draft.ownerId !== this.ownerId) {
      return Promise.reject(new Error("DelegationGrant owner 不匹配"));
    }
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, draft.taskId, this.ownerId);
      if (task.goalHash !== draft.taskGoalHash) {
        throw new Error("DelegationGrant goalHash 与 AgentTask 不匹配");
      }
      if (task.grantId) throw new Error("AgentTask 已绑定不可变 DelegationGrant");
      const grant = createDelegationGrant(draft);
      state.grants.push(grant);
      task.grantId = grant.id;
      task.status = "queued";
      task.updatedAt = grant.confirmedByUserAt;
      return grant;
    });
  }

  public async getActive(taskId: string): Promise<{
    grant: DelegationGrantV1 | null;
    revocation: GrantRevocationV1 | null;
  }> {
    return this.repository.read((state) => {
      const task = requireTask(state.tasks, taskId, this.ownerId);
      const grant = state.grants.find((candidate) => candidate.id === task.grantId) ?? null;
      if (grant && !verifyDelegationGrant(grant)) {
        throw new Error("DelegationGrant contentHash 校验失败");
      }
      const revocation = grant
        ? state.revocations.find((candidate) => candidate.grantId === grant.id) ?? null
        : null;
      return { grant, revocation };
    });
  }

  public revoke(
    taskId: string,
    reason: GrantRevocationV1["reason"],
  ): Promise<GrantRevocationV1> {
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, taskId, this.ownerId);
      const grant = state.grants.find((candidate) => candidate.id === task.grantId);
      if (!grant) throw new Error("AgentTask 没有可撤销的 DelegationGrant");
      const existing = state.revocations.find((candidate) => candidate.grantId === grant.id);
      if (existing) return existing;
      const revokedAt = new Date().toISOString();
      const revocation: GrantRevocationV1 = {
        version: 1, grantId: grant.id, ownerId: this.ownerId, reason, revokedAt,
      };
      state.revocations.push(revocation);
      const run = state.runs.find((candidate) => candidate.id === task.activeRunId);
      if (run?.status === "running") {
        run.status = "canceled";
        run.endedAt = revokedAt;
        run.stopReason = "grant_revoked";
      }
      if (!["completed", "partially_completed", "failed", "canceled", "expired"]
        .includes(task.status)) {
        task.status = "paused";
        task.activeRunId = null;
        task.waiting = null;
      }
      task.updatedAt = revokedAt;
      return revocation;
    });
  }
}
