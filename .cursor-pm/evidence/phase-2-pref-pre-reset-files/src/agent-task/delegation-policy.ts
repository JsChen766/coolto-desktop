import type {
  DelegationGrantV1,
  GrantRevocationV1,
  PolicyDecisionV1,
} from "./grant-types.js";
import type { ToolCapabilityMetadataV1 } from "./tool-capability-types.js";
import { stageScopes, type CapabilityStage } from "./stage-policy.js";

export interface DelegationPolicyInput {
  ownerId: string;
  taskId: string;
  runId: string;
  toolCallId: string;
  taskGoalHash: string;
  requestHash: string;
  targetOrigin: string | null;
  metadata: ToolCapabilityMetadataV1;
  grant: DelegationGrantV1 | null;
  revocation: GrantRevocationV1 | null;
  unattended: boolean;
  freshObservation: boolean;
  sitePolicyAllowed: boolean;
  currentStage?: CapabilityStage;
  stageTransitionId?: string | null;
  now?: string;
}

export function evaluateDelegationPolicy(
  input: DelegationPolicyInput,
): PolicyDecisionV1 {
  const now = input.now ?? new Date().toISOString();
  const grant = input.grant;
  if (!grant) return decision(input, now, "ask", "grant_missing", null);
  if (input.revocation) return decision(input, now, "block", "grant_revoked", grant);
  if (grant.ownerId !== input.ownerId || grant.taskId !== input.taskId) {
    return decision(input, now, "block", "grant_owner_or_task_mismatch", grant);
  }
  if (grant.taskGoalHash !== input.taskGoalHash) {
    return decision(input, now, "block", "grant_goal_mismatch", grant);
  }
  const nowTime = Date.parse(now);
  const validFrom = Date.parse(grant.validFrom);
  const expiresAt = Date.parse(grant.expiresAt);
  if (![nowTime, validFrom, expiresAt].every(Number.isFinite) ||
      nowTime < validFrom || nowTime >= expiresAt) {
    return decision(input, now, "block", "grant_inactive", grant);
  }
  if (!input.sitePolicyAllowed) {
    return decision(input, now, "block", "site_policy_blocked", grant);
  }
  const domainDecision = evaluateDomain(input.targetOrigin, grant);
  if (domainDecision) return decision(input, now, "block", domainDecision, grant);
  if (!input.metadata.requiredScopes.every((scope) => grant.allowedActions.includes(scope))) {
    return decision(input, now, "ask", "scope_not_granted", grant);
  }
  if (input.currentStage &&
      input.currentStage !== "observe" && !input.stageTransitionId) {
    return decision(input, now, "block", "stage_transition_missing", grant);
  }
  if (input.currentStage &&
      input.currentStage === "observe" &&
      input.metadata.sideEffect !== "read" &&
      !input.metadata.requiredScopes.every((scope) => scope === "task.lifecycle")) {
    return decision(input, now, "block", "stage_scope_not_granted", grant);
  }
  if (input.currentStage && input.currentStage !== "observe" &&
      !input.metadata.requiredScopes.every((scope) =>
        stageScopes(grant, input.currentStage!).includes(scope))) {
    return decision(input, now, "block", "stage_scope_not_granted", grant);
  }
  if (input.metadata.requiresFreshObservation && !input.freshObservation) {
    return decision(input, now, "block", "fresh_observation_required", grant);
  }
  if (input.metadata.risk === "R3" || !input.metadata.unattendedAllowed) {
    return decision(input, now, "ask", "human_required", grant);
  }
  if (input.unattended && (!grant.unattended || input.metadata.risk === "R2" && !grant.unattended)) {
    return decision(input, now, "ask", "unattended_not_granted", grant);
  }
  return decision(input, now, "allow", "grant_allowed", grant);
}

function evaluateDomain(
  origin: string | null,
  grant: DelegationGrantV1,
): string | null {
  if (!origin) return null;
  let host: string;
  try { host = new URL(origin).hostname.toLowerCase(); }
  catch { return "invalid_target_origin"; }
  if (grant.blockedDomains.some((domain) => matchesDomain(host, domain))) {
    return "domain_blocked";
  }
  if (!grant.allowedDomains.some((domain) => matchesDomain(host, domain))) {
    return "domain_not_allowed";
  }
  return null;
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function decision(
  input: DelegationPolicyInput,
  now: string,
  value: PolicyDecisionV1["decision"],
  reasonCode: string,
  grant: DelegationGrantV1 | null,
): PolicyDecisionV1 {
  return {
    version: 1,
    ownerId: input.ownerId,
    taskId: input.taskId,
    runId: input.runId,
    toolCallId: input.toolCallId,
    decision: value,
    reasonCode,
    requestHash: input.requestHash,
    grantId: grant?.id ?? null,
    grantHash: grant?.contentHash ?? null,
    ...(input.currentStage ? { currentStage: input.currentStage } : {}),
    ...(input.stageTransitionId === undefined ? {} : { stageTransitionId: input.stageTransitionId }),
    actionTokenId: null,
    decidedAt: now,
  };
}
