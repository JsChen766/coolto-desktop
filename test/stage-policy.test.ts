import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDelegationPolicy } from "../src/agent-task/delegation-policy.js";
import { createDefaultStagePolicy, TaskStageController } from "../src/agent-task/stage-policy.js";
import type { DelegationGrantV1 } from "../src/agent-task/grant-types.js";
import type { ToolCapabilityMetadataV1 } from "../src/agent-task/tool-capability-types.js";

const grant: DelegationGrantV1 = {
  version: 1, id: "grant-1", ownerId: "owner", taskId: "task", taskGoalHash: "goal",
  allowedDomains: ["jobs.example"], blockedDomains: [],
  allowedActions: ["browser.read", "browser.write", "task.lifecycle"],
  stagePolicy: createDefaultStagePolicy(["browser.read", "browser.write", "task.lifecycle"]),
  jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {}, unattended: true,
  validFrom: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z",
  policyVersion: "stage-v1", confirmedByUserAt: "2026-01-01T00:00:00.000Z", contentHash: "grant-hash",
};
const metadata: ToolCapabilityMetadataV1 = {
  sideEffect: "reversible", risk: "R1", requiredScopes: ["browser.write"],
  concurrency: "sequential", idempotency: "request_key", evidence: "action_receipt",
  requiresFreshObservation: false, unattendedAllowed: true,
};

 test("default stage policy separates observation from approved action", () => {
  const policy = createDefaultStagePolicy(grant.allowedActions);
  assert.deepEqual(policy.observe, ["browser.read", "task.lifecycle"]);
  assert.deepEqual(policy.prepare, ["browser.read", "task.lifecycle"]);
  assert.deepEqual(policy.approved_action, grant.allowedActions);
});

test("delegation policy blocks side effects until a host transition exists", () => {
  const base = {
    ownerId: "owner", taskId: "task", runId: "run", toolCallId: "call", taskGoalHash: "goal",
    requestHash: "request", targetOrigin: "https://jobs.example", metadata, grant,
    revocation: null, unattended: true, freshObservation: true, sitePolicyAllowed: true,
  };
  assert.equal(evaluateDelegationPolicy({ ...base, currentStage: "observe" }).reasonCode, "stage_scope_not_granted");
  assert.equal(evaluateDelegationPolicy({ ...base, currentStage: "approved_action" }).reasonCode, "stage_transition_missing");
  assert.equal(evaluateDelegationPolicy({ ...base, currentStage: "approved_action", stageTransitionId: "transition-1" }).decision, "allow");
});

test("TaskStageController issues monotonic transitions bound to grant and context", () => {
  const stages = new TaskStageController();
  stages.start({ ownerId: "owner", taskId: "task", runId: "run", grantHash: "grant" });
  const transition = stages.transition({
    ownerId: "owner", taskId: "task", runId: "run", grantHash: "grant", to: "prepare",
    profileVersion: 4, preferenceResolutionHash: "resolution", reason: "host observation",
    now: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(transition.from, "observe");
  assert.equal(stages.current("task", "run")?.transitionId, transition.id);
  assert.throws(() => stages.transition({
    ownerId: "owner", taskId: "task", runId: "run", grantHash: "grant", to: "observe", reason: "backward",
  }), /单向推进/u);
  assert.throws(() => stages.transition({
    ownerId: "owner", taskId: "task", runId: "run", grantHash: "other", to: "approved_action", reason: "wrong grant",
  }), /不匹配/u);
});

test("observe permits read side effects only when a scope is shared", () => {
  const readMetadata = { ...metadata, sideEffect: "read" as const, requiredScopes: ["jobs.evaluate"] };
  const reversibleMetadata = { ...readMetadata, sideEffect: "reversible" as const };
  const readGrant = {
    ...grant, allowedActions: [...grant.allowedActions, "jobs.evaluate"],
    stagePolicy: createDefaultStagePolicy([...grant.allowedActions, "jobs.evaluate"]),
  };
  const base = {
    ownerId: "owner", taskId: "task", runId: "run", toolCallId: "call", taskGoalHash: "goal",
    requestHash: "request", targetOrigin: null, grant: readGrant, revocation: null,
    unattended: true, freshObservation: true, sitePolicyAllowed: true,
    currentStage: "observe" as const,
  };
  assert.equal(evaluateDelegationPolicy({ ...base, metadata: readMetadata }).decision, "allow");
  assert.equal(evaluateDelegationPolicy({ ...base, metadata: reversibleMetadata }).reasonCode, "stage_scope_not_granted");
});