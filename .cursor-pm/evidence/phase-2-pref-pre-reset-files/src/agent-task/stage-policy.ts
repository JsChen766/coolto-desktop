import { canonicalHash } from "./canonical-hash.js";
import type { DelegationGrantV1 } from "./grant-types.js";
import type { JsonValue } from "./json-types.js";
import { uuidV7 } from "./uuid-v7.js";
import { CAPABILITY_STAGES, type CapabilityStage } from "./capability-stage-types.js";
export { CAPABILITY_STAGES, type CapabilityStage } from "./capability-stage-types.js";

export interface GrantStagePolicyV1 {
  observe: string[];
  prepare: string[];
  approved_action: string[];
  reconcile: string[];
  wait: string[];
}

export interface ProfilePreferenceContextSnapshot {
  profileVersion: number;
  profileLocalVersion?: number | null;
  resolutionHash: string;
}

export interface StageTransitionV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  runId: string;
  from: CapabilityStage;
  to: CapabilityStage;
  grantHash: string;
  profileVersion: number | null;
  preferenceResolutionHash: string | null;
  reason: string;
  createdAt: string;
  transitionHash: string;
}

interface StageState {
  ownerId: string;
  taskId: string;
  runId: string;
  stage: CapabilityStage;
  transitionId: string | null;
  grantHash: string;
}

export function createObserveOnlyStagePolicy(): GrantStagePolicyV1 {
  return { observe: [], prepare: [], approved_action: [], reconcile: [], wait: ["task.lifecycle"] };
}

export function normalizeStagePolicy(
  value: unknown,
  allowedActions: readonly string[],
): GrantStagePolicyV1 {
  if (value === undefined) return createObserveOnlyStagePolicy();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("DelegationGrant stagePolicy 无效");
  }
  const record = value as Record<string, unknown>;
  const policy = Object.fromEntries(CAPABILITY_STAGES.map((stage) => {
    const raw = record[stage];
    if (!Array.isArray(raw) || raw.some((scope) => typeof scope !== "string")) {
      throw new Error(`DelegationGrant stagePolicy.${stage} 无效`);
    }
    return [stage, [...new Set(raw)].filter((scope) => allowedActions.includes(scope)).sort()];
  })) as unknown as GrantStagePolicyV1;
  return policy;
}

export function createDefaultStagePolicy(
  allowedActions: readonly string[],
): GrantStagePolicyV1 {
  const allowed = [...new Set(allowedActions)];
  const observe = allowed.filter((scope) => READ_SCOPES.has(scope));
  const prepare = allowed.filter((scope) => !APPROVED_ACTION_SCOPES.has(scope));
  const reconcile = allowed.filter((scope) => READ_SCOPES.has(scope) || RECONCILE_SCOPES.has(scope));
  return { observe, prepare, approved_action: allowed, reconcile, wait: ["task.lifecycle"] };
}

export function stageScopes(
  grant: Pick<DelegationGrantV1, "allowedActions" | "stagePolicy">,
  stage: CapabilityStage,
): readonly string[] {
  if (!grant.stagePolicy) {
    return stage === "observe"
      ? grant.allowedActions.filter((scope) => READ_SCOPES.has(scope))
      : [];
  }
  return grant.stagePolicy[stage];
}

export class TaskStageController {
  readonly #states = new Map<string, StageState>();

  public start(input: {
    ownerId: string;
    taskId: string;
    runId: string;
    grantHash: string;
  }): StageTransitionV1 | null {
    this.#states.set(input.runId, {
      ...input, stage: "observe", transitionId: null,
    });
    return null;
  }

  public current(taskId: string, runId: string): {
    stage: CapabilityStage;
    transitionId: string | null;
    grantHash: string;
  } | undefined {
    const state = this.#states.get(runId);
    if (!state || state.taskId !== taskId) return undefined;
    return { stage: state.stage, transitionId: state.transitionId, grantHash: state.grantHash };
  }

  public transition(input: {
    ownerId: string;
    taskId: string;
    runId: string;
    grantHash: string;
    to: CapabilityStage;
    profileVersion?: number | null;
    preferenceResolutionHash?: string | null;
    reason: string;
    now?: string;
  }): StageTransitionV1 {
    const state = this.#states.get(input.runId);
    if (!state || state.ownerId !== input.ownerId || state.taskId !== input.taskId ||
        state.grantHash !== input.grantHash) {
      throw new Error("TaskStage 与当前 task/run/grant 不匹配");
    }
    const fromIndex = CAPABILITY_STAGES.indexOf(state.stage);
    const toIndex = CAPABILITY_STAGES.indexOf(input.to);
    if (toIndex <= fromIndex || state.stage === "wait") {
      throw new Error("TaskStage 只能单向推进");
    }
    const createdAt = new Date(input.now ?? Date.now()).toISOString();
    const transitionBase = {
      version: 1 as const, id: uuidV7(), ownerId: input.ownerId,
      taskId: input.taskId, runId: input.runId, from: state.stage, to: input.to,
      grantHash: input.grantHash, profileVersion: input.profileVersion ?? null,
      preferenceResolutionHash: input.preferenceResolutionHash ?? null,
      reason: input.reason, createdAt,
    };
    const transition: StageTransitionV1 = {
      ...transitionBase,
      transitionHash: canonicalHash(transitionBase as unknown as JsonValue),
    };
    state.stage = input.to;
    state.transitionId = transition.id;
    return transition;
  }

  public clear(runId: string): void {
    this.#states.delete(runId);
  }

  public clearAll(): void {
    this.#states.clear();
  }
}

const READ_SCOPES = new Set([
  "browser.read", "browser.navigate", "resume.read", "jd.read", "experience.read",
  "jobs.search", "application.loop.read", "strategy.read",
  "tracker.application.read", "mail.read", "answers.read", "task.lifecycle",
]);

const APPROVED_ACTION_SCOPES = new Set([
  "browser.write", "browser.download", "browser.submit",
  "tracker.application.create", "tracker.application.update", "tracker.interview.update",
]);
const RECONCILE_SCOPES = new Set([
  "application.loop.read", "tracker.application.read", "resume.read",
]);
