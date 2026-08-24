import assert from "node:assert/strict";
import test from "node:test";

import { ActionLedger } from "../src/agent-task/action-ledger.js";
import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { AgentTaskStore } from "../src/agent-task/agent-task-store.js";
import { canonicalHash } from "../src/agent-task/canonical-hash.js";
import { DelegationGrantStore } from "../src/agent-task/delegation-grant-store.js";
import { evaluateDelegationPolicy } from "../src/agent-task/delegation-policy.js";
import { EnvironmentEventStore } from "../src/agent-task/environment-event-store.js";
import { ManagedTaskPolicyHooks } from "../src/agent-task/managed-task-policy-hooks.js";
import type { ToolCapabilityMetadataV1 } from "../src/agent-task/tool-capability-types.js";
import { uuidV7 } from "../src/agent-task/uuid-v7.js";
import { applyToolCapabilities } from "../src/tools/tool-capabilities.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";

const ownerId = "owner-1";
const metadata: ToolCapabilityMetadataV1 = {
  sideEffect: "reversible", risk: "R1", requiredScopes: ["browser.navigate"],
  concurrency: "sequential", idempotency: "request_key",
  evidence: "action_receipt", requiresFreshObservation: true,
  unattendedAllowed: true,
};

function harness() {
  const persistence = new MemoryAgentHarnessStatePersistence();
  const repository = new AgentHarnessStateRepository(ownerId, persistence);
  return {
    persistence,
    repository,
    tasks: new AgentTaskStore(ownerId, repository),
    grants: new DelegationGrantStore(ownerId, repository),
    events: new EnvironmentEventStore(ownerId, repository),
    ledger: new ActionLedger(ownerId, repository),
  };
}

async function createGrantedTask(
  value = harness(),
  allowedActions = ["browser.navigate"],
) {
  const task = await value.tasks.create("conversation-1", "Find backend roles");
  const now = Date.now();
  const grant = await value.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: ["blocked.jobs.example"],
    allowedActions, jobCriteria: {}, assetPolicy: {},
    answerPolicy: {}, submissionBudget: { minimumMatch: 80, dailyLimit: null },
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be2-v1",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  return { ...value, task, grant };
}

test("UUIDv7 is time ordered and canonical hashes ignore object key order", () => {
  const first = uuidV7(1_000);
  const second = uuidV7(2_000);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.ok(first < second);
  assert.equal(
    canonicalHash({ a: 1, b: 2 }),
    canonicalHash({ b: 2, a: 1 }),
  );
});

test("task and immutable grant round-trip through one owner repository", async () => {
  const value = await createGrantedTask();
  assert.equal((await value.tasks.get(value.task.id)).status, "queued");
  assert.equal((await value.grants.getActive(value.task.id)).grant?.id, value.grant.id);

  const restored = new AgentHarnessStateRepository(ownerId, value.persistence);
  assert.equal(
    (await new AgentTaskStore(ownerId, restored).get(value.task.id)).goal,
    "Find backend roles",
  );
  await assert.rejects(
    new AgentHarnessStateRepository("owner-2", value.persistence).read((state) => state),
    /owner/u,
  );
});

test("delegation policy honors blocked domain, scope and fresh observation", async () => {
  const { task, grant, grants } = await createGrantedTask();
  const decide = (patch: Partial<Parameters<typeof evaluateDelegationPolicy>[0]> = {}) =>
    evaluateDelegationPolicy({
      ownerId, taskId: task.id, taskGoalHash: task.goalHash,
      runId: "run-1", toolCallId: "tool-1",
      requestHash: "request", targetOrigin: "https://jobs.example",
      metadata, grant, revocation: null, unattended: true,
      freshObservation: true, sitePolicyAllowed: true, ...patch,
    });
  assert.equal(decide().decision, "allow");
  assert.equal(decide({ targetOrigin: "https://blocked.jobs.example" }).reasonCode, "domain_blocked");
  assert.equal(decide({ freshObservation: false }).reasonCode, "fresh_observation_required");
  assert.equal(decide({ metadata: { ...metadata, requiredScopes: ["browser.submit"] } }).decision, "ask");
  const revocation = await grants.revoke(task.id, "user");
  assert.equal(decide({ revocation }).reasonCode, "grant_revoked");
});

test("events dedupe, redeliver until checkpoint acknowledgement", async () => {
  const value = await createGrantedTask();
  const draft = {
    taskId: value.task.id, source: "browser" as const, type: "browser.changed",
    trust: "external_untrusted" as const, occurredAt: new Date().toISOString(),
    dedupeKey: "browser:1", payloadRef: null, payloadHash: "hash",
  };
  const first = await value.events.enqueue(draft);
  assert.equal((await value.events.enqueue(draft)).id, first.id);
  await value.events.markDelivered(first.id);
  assert.equal((await value.events.pending(value.task.id))[0]?.status, "delivered");
  await value.events.markDelivered(first.id);
  assert.equal((await value.events.pending(value.task.id))[0]?.deliveryAttempts, 2);
  assert.equal((await value.events.acknowledge(first.id)).status, "acknowledged");
  assert.equal((await value.events.pending(value.task.id)).length, 0);
});

test("action token consumption is atomic, replay-safe and context-bound", async () => {
  const value = await createGrantedTask();
  const run = await value.tasks.startRun({ taskId: value.task.id, wakeCause: "user" });
  const token = await value.ledger.issue({
    ownerId, taskId: value.task.id, runId: run.id, toolName: "browser_navigate",
    requestHash: "request-1", grantHash: value.grant.contentHash,
    targetOrigin: "https://jobs.example", tabId: "tab-1",
    observationHash: "observation-1",
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  });
  const input = {
    tokenId: token.id, toolCallId: "tool-1", targetOrigin: "https://jobs.example",
    tabId: "tab-1", observationHash: "observation-1", status: "succeeded" as const,
    observationAfterHash: "observation-2",
  };
  const receipt = await value.ledger.consume(input);
  assert.equal((await value.ledger.consume(input)).id, receipt.id);

  const stale = await value.ledger.issue({
    ownerId, taskId: value.task.id, runId: run.id, toolName: "browser_navigate",
    requestHash: "request-2", grantHash: value.grant.contentHash,
    targetOrigin: "https://jobs.example", tabId: "tab-1",
    observationHash: "observation-1",
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  });
  const blocked = await value.ledger.consume({
    ...input, tokenId: stale.id, toolCallId: "tool-2", tabId: "other",
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.errorCode, "action_token_context_mismatch_or_expired");
});

test("managed hooks block stale writes then issue and reconcile one action token", async () => {
  const value = harness();
  const granted = await createGrantedTask(value, ["browser.read", "browser.write"]);
  await value.tasks.startRun({ taskId: granted.task.id, wakeCause: "user" });
  const tools = applyToolCapabilities([
    { name: "browser_snapshot", label: "snapshot", description: "", parameters: {} as never,
      execute: async () => ({ content: [], details: {} }) },
    { name: "browser_fill_field", label: "fill", description: "", parameters: {} as never,
      execute: async () => ({ content: [], details: {} }), executionMode: "sequential" },
  ]);
  const browser = {
    getActiveTab: () => ({
      id: "tab-1", title: "Jobs", url: "https://jobs.example/apply",
      isActive: true, isLoading: false, canGoBack: false, canGoForward: false,
    }),
  } as BrowserAgentController;
  const hooks = new ManagedTaskPolicyHooks({
    conversationId: granted.task.conversationId,
    services: new AgentHarnessServices(ownerId, value.repository),
    browser,
    tools,
    sitePolicyAllows: () => true,
  });
  const before = (name: string, id: string) => {
    const toolCall = { type: "toolCall" as const, name, id, arguments: {} };
    return hooks.beforeToolCall({
      toolCall,
      args: {}, assistantMessage: { content: [toolCall] } as never,
      context: {} as never,
    });
  };
  assert.match((await before("browser_fill_field", "fill-stale"))?.reason ?? "", /fresh_observation/u);

  assert.equal(await before("browser_snapshot", "snapshot"), undefined);
  await hooks.afterToolCall({
    toolCall: { type: "toolCall", name: "browser_snapshot", id: "snapshot", arguments: {} },
    args: {}, assistantMessage: {} as never, context: {} as never,
    result: { content: [], details: { tab: browser.getActiveTab(), page: { text: "role" } } },
    isError: false,
  });
  assert.equal(await before("browser_fill_field", "fill-fresh"), undefined);
  await hooks.afterToolCall({
    toolCall: { type: "toolCall", name: "browser_fill_field", id: "fill-fresh", arguments: {} },
    args: {}, assistantMessage: {} as never, context: {} as never,
    result: { content: [], details: { changed: true } }, isError: false,
  });
  const receipts = await value.ledger.listReceipts(granted.task.id);
  assert.deepEqual(receipts.map((receipt) => receipt.status), ["blocked", "succeeded"]);
  assert.equal((await value.repository.read((state) => state.actionTokens)).length, 1);
});
