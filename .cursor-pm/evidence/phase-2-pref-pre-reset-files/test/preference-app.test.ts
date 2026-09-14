import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import type { AgentHarnessStatePersistence } from "../src/agent-task/agent-harness-state-repository.js";
import { normalizeAgentHarnessStateV1 } from "../src/agent-task/normalize-agent-harness-state.js";
import { PreferenceSuggestionStore } from "../src/desktop/main/agent-task/preference-suggestion-store.js";
import { preferencePatternHash } from "../src/preference/normalizer.js";
import { createPreferenceSnapshot } from "../src/desktop/main/preference/preference-sync-mapping.js";
import { PreferenceProposalService } from "../src/desktop/main/preference/preference-proposal-service.js";
import { PreferenceSyncStore } from "../src/desktop/main/preference/preference-sync-store.js";
import type { EnqueueMutation, LocalEntity, SyncIssue } from "../src/desktop/main/sync/local-sync-types.js";
import type { PreferenceSuggestionV1, PreferenceV1 } from "../src/preference/types.js";
import type { LocalSyncStore } from "../src/desktop/main/sync/local-sync-store.js";

const ownerId = "00000000-0000-4000-8000-000000000001";
const now = "2026-09-08T00:00:00.000Z";

class FakeLocal {
  readonly writes: EnqueueMutation[] = [];
  readonly replaced: EnqueueMutation[] = [];
  readonly entities = new Map<string, LocalEntity>();
  issue: SyncIssue | undefined;
  failEnqueue = false;
  beforeEnqueue?: () => void;

  constructor() {
    const preference = createPreferenceSnapshot(ownerId, "00000000-0000-4000-8000-000000000002", {
      key: "resume.tone", value: "restrained", scope: { kind: "global" }, priority: 50,
    }, now);
    this.entities.set(preference.id, {
      entityType: "user_preference", entityId: preference.id, entityVersion: 1, localVersion: 1,
      syncStatus: "clean", operation: "upsert", changedAt: now,
      payload: structuredClone(preference) as unknown as Record<string, unknown>,
    });
  }

  getEntity(_type: string, id: string): LocalEntity | undefined { return this.entities.get(id); }
  listEntities(_type: string): LocalEntity[] { return [...this.entities.values()]; }
  getSyncIssue(): SyncIssue | undefined { return this.issue; }
  enqueue(mutation: EnqueueMutation): string {
    this.beforeEnqueue?.();
    if (this.failEnqueue) throw new Error("synthetic local enqueue failure");
    this.apply(mutation); this.writes.push(mutation); return mutation.operationId;
  }
  replaceBlocked(mutation: EnqueueMutation): void { this.apply(mutation); this.replaced.push(mutation); }
  acceptServer(): void { this.issue = undefined; }

  private apply(mutation: EnqueueMutation): void {
    const existing = this.entities.get(mutation.entityId);
    this.entities.set(mutation.entityId, {
      entityType: mutation.entityType, entityId: mutation.entityId,
      entityVersion: mutation.expectedVersion ?? 0, localVersion: (existing?.localVersion ?? 0) + 1,
      syncStatus: "pending", operation: mutation.action === "delete" ? "delete" : "upsert",
      changedAt: now, payload: structuredClone(mutation.localPayload ?? mutation.payload),
    });
  }
}

class FlakyHarnessPersistence implements AgentHarnessStatePersistence {
  private readonly delegate = new MemoryAgentHarnessStatePersistence();
  failSaves = 0;

  load(): Promise<import("../src/agent-task/agent-harness-state.js").AgentHarnessStateV1 | undefined> {
    return this.delegate.load();
  }
  async save(state: import("../src/agent-task/agent-harness-state.js").AgentHarnessStateV1): Promise<void> {
    if (this.failSaves > 0) { this.failSaves -= 1; throw new Error("synthetic harness save failure"); }
    await this.delegate.save(state);
  }
  clear(): Promise<void> { return this.delegate.clear(); }
}

function service(local: FakeLocal, suggestions?: PreferenceSuggestionStore): { store: PreferenceSyncStore; proposals: PreferenceProposalService } {
  const store = new PreferenceSyncStore(ownerId, local as unknown as LocalSyncStore, () => undefined, async () => undefined);
  return { store, proposals: new PreferenceProposalService(ownerId, store, async () => undefined, suggestions) };
}

function pendingSuggestion(id = "suggestion-1"): PreferenceSuggestionV1 {
  return {
    version: 1, id, ownerId, sessionId: "session-1", turnId: "turn-1", actionId: "action-1", eventIds: ["event-1"],
    patternHash: preferencePatternHash("resume.bullet_style", "concise", { kind: "global" }),
    key: "resume.bullet_style", proposedValue: "concise",
    scope: { kind: "global" }, conflictGroup: "resume.bullet_style", observationCount: 3,
    observationActionCount: 2, observationWindow: { from: "2026-09-01T00:00:00.000Z", to: now },
    confidence: "strong", rationale: { code: "repeated_selection_pattern", referenceHashes: [] },
    state: "pending", createdAt: now, lastPresentedAt: null, expiresAt: "2026-10-01T00:00:00.000Z",
    ruleVersion: "resume-bullet-v1",
  };
}

test("Preference create waits for approval and emits the accepted backend mutation shape", async () => {
  const local = new FakeLocal();
  const { proposals } = service(local);
  const proposal = await proposals.prepareCreate({
    key: "resume.bullet_style", value: "concise", scope: { kind: "global" }, priority: 60,
  });
  assert.equal(local.writes.length, 0);
  assert.equal(proposal.current, null);
  await proposals.execute(proposal.id);
  assert.equal(local.writes.length, 1);
  const operation = local.writes[0]!;
  assert.match(operation.operationId, /^[0-9a-f-]{36}$/u);
  assert.equal(operation.entityType, "user_preference");
  assert.equal(operation.action, "create");
  assert.equal(operation.expectedVersion, null);
  assert.equal("id" in operation.payload, false);
  assert.equal(operation.payload.ownerId, ownerId);
  assert.equal(local.entities.get(proposal.preferenceId!)?.syncStatus, "pending");
});

test("Preference update keeps priority when a value change omits priority", async () => {
  const local = new FakeLocal();
  const { proposals } = service(local);
  const id = [...local.entities.keys()][0]!;
  const proposal = await proposals.prepareUpdate(id, {
    key: "resume.tone", value: "standard", scope: { kind: "global" },
  });
  assert.equal(proposal.current?.priority, 50);
  assert.equal(proposal.next?.priority, 50);
});

test("Preference disable, re-enable, and delete remain proposal-bound mutations", async () => {
  const local = new FakeLocal();
  const { store, proposals } = service(local);
  const id = [...local.entities.keys()][0]!;
  for (const action of ["prepareDisable", "prepareEnable", "prepareDelete"] as const) {
    const beforeWrites = local.writes.length;
    const proposal = await proposals[action](id);
    assert.equal(local.writes.length, beforeWrites);
    await proposals.execute(proposal.id);
    assert.equal(local.writes.at(-1)?.entityId, id);
  }
  assert.equal(local.writes.map((item) => item.action).join(","), "update,update,delete");
  assert.equal(await store.getPreference(id), null);
});

test("Preference reapply uses replaceBlocked and preserves the server expected version", async () => {
  const local = new FakeLocal();
  const { store, proposals } = service(local);
  const id = [...local.entities.keys()][0]!;
  const entity = local.entities.get(id)!;
  const server = createPreferenceSnapshot(ownerId, id, {
    key: "resume.tone", value: "standard", scope: { kind: "global" }, priority: 40,
  }, now);
  local.issue = {
    entityType: "user_preference", entityId: id, status: "conflict", action: "update",
    serverVersion: 4, serverOperation: "upsert", errorCode: "entity_version_conflict",
    localPayload: entity.payload, serverPayload: structuredClone(server) as unknown as Record<string, unknown>,
  };
  local.entities.set(id, { ...entity, entityVersion: 4, syncStatus: "conflict" });
  const proposal = await proposals.prepareReapply(id);
  await proposals.execute(proposal.id);
  assert.equal(local.replaced.length, 1);
  assert.equal(local.replaced[0]?.expectedVersion, 4);
  assert.equal(local.writes.length, 0);
});

test("Preference resolution excludes local conflict and failed entities", async () => {
  for (const syncStatus of ["conflict", "failed"] as const) {
    const local = new FakeLocal();
    const id = [...local.entities.keys()][0]!;
    local.entities.set(id, { ...local.entities.get(id)!, syncStatus });
    const { store } = service(local);
    assert.deepEqual(await store.listPreferences(), []);
  }
});
test("conflicted Preference blocks ordinary mutation until recovery", async () => {
  const local = new FakeLocal();
  const id = [...local.entities.keys()][0]!;
  const entity = local.entities.get(id)!;
  local.entities.set(id, { ...entity, syncStatus: "conflict" });
  local.issue = {
    entityType: "user_preference", entityId: id, status: "conflict", action: "update",
    serverVersion: 0, serverOperation: null, errorCode: "network_unavailable",
    localPayload: entity.payload, serverPayload: null,
  };
  const { proposals } = service(local);
  await assert.rejects(() => proposals.prepareUpdate(id, { value: "direct" }), /解决 Preference 同步问题/u);
  await assert.rejects(() => proposals.prepareDisable(id), /解决 Preference 同步问题/u);
  await assert.rejects(() => proposals.prepareDelete(id), /解决 Preference 同步问题/u);
  assert.equal(local.writes.length, 0);
});

test("accepted behavior suggestions are consumed durably and stay consumed after restart", async () => {
  const persistence = new MemoryAgentHarnessStatePersistence();
  const repository = new AgentHarnessStateRepository(ownerId, persistence);
  const suggestion = pendingSuggestion();
  await repository.update((state) => { state.preferenceSuggestions.push(suggestion); });
  const firstStore = new PreferenceSuggestionStore(ownerId, repository);
  await firstStore.assertPending(suggestion.id);
  await firstStore.accept(suggestion.id, "preference-1", now);
  assert.deepEqual(await repository.read((state) => state.preferenceSuggestions[0]), {
    ...suggestion, state: "accepted", acceptedAt: now, acceptedPreferenceId: "preference-1",
  });
  await assert.rejects(firstStore.assertPending(suggestion.id), /消费/u);
  await firstStore.accept(suggestion.id, "preference-1", now);
  await assert.rejects(firstStore.accept(suggestion.id, "preference-2", now), /其他 Preference/u);

  const restored = new AgentHarnessStateRepository(ownerId, persistence);
  const restartedStore = new PreferenceSuggestionStore(ownerId, restored);
  assert.deepEqual(await restartedStore.list({ resolve: () => null }, now), []);
  await assert.rejects(restartedStore.assertPending(suggestion.id), /消费/u);

  const legacy = normalizeAgentHarnessStateV1({
    version: 1, ownerId, tasks: [], runs: [], checkpoints: [], grants: [], revocations: [],
    policyDecisions: [], events: [], actionTokens: [], actionReceipts: [],
    preferenceSuggestions: [{ ...suggestion, state: undefined, acceptedAt: "stale", acceptedPreferenceId: "stale" }],
    preferenceSuppressions: [], preferenceUsage: [], updatedAt: now,
  });
  assert.equal(legacy?.preferenceSuggestions[0]?.state, "pending");
  assert.equal(legacy?.preferenceSuggestions[0]?.acceptedAt, null);
  assert.equal(legacy?.preferenceSuggestions[0]?.acceptedPreferenceId, null);
});

test("suggestion-bound preference approval consumes the suggestion with the local enqueue", async () => {
  const persistence = new MemoryAgentHarnessStatePersistence();
  const repository = new AgentHarnessStateRepository(ownerId, persistence);
  const suggestion = pendingSuggestion("suggestion-bound");
  await repository.update((state) => { state.preferenceSuggestions.push(suggestion); });
  const suggestionStore = new PreferenceSuggestionStore(ownerId, repository);
  const local = new FakeLocal();
  const { proposals } = service(local, suggestionStore);
  await assert.rejects(proposals.prepareCreateFromSuggestion({
    key: suggestion.key, value: "action_first", scope: suggestion.scope,
    priority: 50, source: "behavior_confirmed", sourceSuggestionHash: suggestion.patternHash,
  }, suggestion.id), /确认内容不一致/u);
  const proposal = await proposals.prepareCreateFromSuggestion({
    key: suggestion.key, value: suggestion.proposedValue, scope: suggestion.scope,
    priority: 50, source: "behavior_confirmed", sourceSuggestionHash: suggestion.patternHash,
  }, suggestion.id);
  await proposals.execute(proposal.id);
  assert.equal(local.writes.length, 1);
  assert.deepEqual(await suggestionStore.list({ resolve: () => null }, now), []);
  assert.equal((await repository.read((state) => state.preferenceSuggestions[0]))?.acceptedPreferenceId, proposal.preferenceId);
});

test("accepted suggestion orphan is reconciled after enqueue and rollback persistence failures", async () => {
  const persistence = new FlakyHarnessPersistence();
  const repository = new AgentHarnessStateRepository(ownerId, persistence);
  const suggestion = pendingSuggestion("suggestion-orphan");
  await repository.update((state) => { state.preferenceSuggestions.push(suggestion); });
  const suggestionStore = new PreferenceSuggestionStore(ownerId, repository);
  const local = new FakeLocal();
  local.failEnqueue = true;
  local.beforeEnqueue = () => { persistence.failSaves = 2; };
  const { proposals, store } = service(local, suggestionStore);
  const proposal = await proposals.prepareCreateFromSuggestion({
    key: suggestion.key, value: suggestion.proposedValue, scope: suggestion.scope,
    priority: 50, source: "behavior_confirmed", sourceSuggestionHash: suggestion.patternHash,
  }, suggestion.id);
  await assert.rejects(proposals.execute(proposal.id), /恢复失败/u);
  assert.equal((await repository.read((state) => state.preferenceSuggestions[0]))?.state, "accepted");
  await suggestionStore.reconcileAccepted(store);
  await suggestionStore.assertPending(suggestion.id);
});

void ownerId;
void now;
