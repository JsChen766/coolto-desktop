import assert from "node:assert/strict";
import test from "node:test";

import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import { ActionExecutorRegistry } from "../src/approvals/executor-registry.js";
import { createAnswerVaultApprovalExecutor } from "../src/agent-task/answer-vault-approval-executor.js";
import {
  ANSWER_VAULT_UPSERT_ACTION,
  createAnswerVaultApprovalDraft,
} from "../src/agent-task/answer-vault-approval.js";
import { AnswerVaultStore } from "../src/agent-task/answer-vault-store.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { createAnswerVaultTools } from "../src/tools/answer-vault-tools.js";

function setup() {
  const repository = new AgentHarnessStateRepository(
    "owner-1", new MemoryAgentHarnessStatePersistence(),
  );
  const store = new AnswerVaultStore("owner-1", repository);
  const executors = new ActionExecutorRegistry();
  executors.register(
    ANSWER_VAULT_UPSERT_ACTION,
    createAnswerVaultApprovalExecutor(store),
  );
  const approvals = new ApprovalManager(new ApprovalStore(), executors);
  return { store, approvals };
}

const payload = {
  category: "work_authorization" as const,
  questionKey: "Are you authorized to work in Canada?",
  value: "Yes",
  scopeDomains: ["jobs.example.com"],
  expiresAt: "2028-01-01T00:00:00.000Z",
};

test("Answer Vault approval is immutable and writes only after acceptance", async () => {
  const { store, approvals } = setup();
  const submitted = structuredClone(payload);
  const request = await approvals.request(
    createAnswerVaultApprovalDraft(submitted), submitted,
  );
  submitted.value = "No";

  assert.deepEqual(await store.list(), []);
  assert.equal(request.actionType, ANSWER_VAULT_UPSERT_ACTION);
  assert.equal(request.payloadHash.length, 64);

  await approvals.resolve(request.id, { type: "accept" });
  const entries = await store.list({ domain: "jobs.example.com" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.value, "Yes");
  assert.equal(entries[0]?.source, "user_confirmed");
  assert.equal(entries[0]?.contentHash.length, 64);
  assert.deepEqual(await store.list({ domain: "other.example" }), []);
});

test("Answer Vault reject and forbidden fields never write", async () => {
  const { store, approvals } = setup();
  const request = await approvals.request(
    createAnswerVaultApprovalDraft(payload), payload,
  );
  await approvals.resolve(request.id, { type: "reject" });
  assert.deepEqual(await store.list(), []);

  await assert.rejects(store.validate({
    category: "availability",
    questionKey: "Disability and veteran status",
    value: "Prefer not to say",
    scopeDomains: [],
  }), /禁存范围/u);
  await assert.rejects(store.validate({
    category: "languages",
    questionKey: "Account password",
    value: "secret",
    scopeDomains: [],
  }), /禁存范围/u);
  assert.deepEqual(await store.list(), []);
});

test("Answer Vault tools expose scoped reads and prepare without direct writes", async () => {
  const { store, approvals } = setup();
  const tools = createAnswerVaultTools({ store, approvals });
  assert.deepEqual(tools.map((tool) => tool.name), [
    "get_answer_vault", "prepare_answer_vault_entry",
  ]);

  const result = await tools[1]!.execute("call-1", payload);
  assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /审批卡/u);
  assert.equal(approvals.listPending().length, 1);
  assert.deepEqual(await store.list(), []);
});
