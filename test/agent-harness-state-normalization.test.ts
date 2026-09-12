import assert from "node:assert/strict";
import test from "node:test";

import { emptyAgentHarnessState } from "../src/agent-task/agent-harness-state.js";
import { normalizeAgentHarnessStateV1 } from "../src/agent-task/normalize-agent-harness-state.js";

test("V1 Harness state adds newer collections without dropping older task state", () => {
  const legacy = structuredClone(emptyAgentHarnessState("owner-1")) as unknown as
    Record<string, unknown>;
  delete legacy.browserLeads;
  delete legacy.leadEvaluations;
  delete legacy.jobSourceCursors;
  delete legacy.submissionIntents;
  delete legacy.submissionReceipts;
  delete legacy.answerVault;
  delete legacy.inboxCursors;
  delete legacy.externalSignals;

  delete legacy.stageTransitions;
  const normalized = normalizeAgentHarnessStateV1(legacy);
  assert.ok(normalized);
  assert.equal(normalized.ownerId, "owner-1");
  assert.deepEqual(normalized.browserLeads, []);
  assert.deepEqual(normalized.submissionReceipts, []);
  assert.deepEqual(normalized.answerVault, []);
  assert.deepEqual(normalized.inboxCursors, []);
  assert.deepEqual(normalized.externalSignals, []);
  assert.deepEqual(normalized.stageTransitions, []);
});

test("V1 Harness state adds the submission claim marker to older intents", () => {
  const legacy = structuredClone(emptyAgentHarnessState("owner-1")) as unknown as
    Record<string, unknown>;
  legacy.submissionIntents = [{ id: "intent-1" }];
  const normalized = normalizeAgentHarnessStateV1(legacy);
  assert.ok(normalized);
  assert.equal(normalized.submissionIntents[0]?.startedAt, null);
});

test("V1 Harness state normalizes missing receipt confirmation as unconfirmed", () => {
  const legacy = structuredClone(emptyAgentHarnessState("owner-1")) as unknown as
    Record<string, unknown>;
  legacy.submissionReceipts = [{ id: "receipt-1" }];
  const normalized = normalizeAgentHarnessStateV1(legacy);
  assert.ok(normalized);
  assert.equal(normalized.submissionReceipts[0]?.userConfirmedAt, null);
});

test("V1 Harness state still rejects corrupt required and extension fields", () => {
  const missingCore = structuredClone(emptyAgentHarnessState("owner-1")) as unknown as
    Record<string, unknown>;
  delete missingCore.tasks;
  assert.equal(normalizeAgentHarnessStateV1(missingCore), undefined);

  const corruptExtension = structuredClone(emptyAgentHarnessState("owner-1")) as unknown as
    Record<string, unknown>;
  corruptExtension.answerVault = {};
  assert.equal(normalizeAgentHarnessStateV1(corruptExtension), undefined);
});
