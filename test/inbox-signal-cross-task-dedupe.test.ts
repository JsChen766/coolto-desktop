import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import type { AgentEvidenceStore, AgentEvidenceV1 } from "../src/agent-task/evidence-types.js";
import type { AgentTaskV1 } from "../src/agent-task/task-types.js";
import { InboxSignalController } from "../src/inbox-signals/inbox-signal-controller.js";
import type {
  InboxIncrementalAdapter,
  InboxMessagePayloadV1,
  MailConnection,
} from "../src/inbox-signals/inbox-signal-types.js";

test("A second mail loop on the same connection gets its own readable event", async () => {
  const harness = new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository("owner", new MemoryAgentHarnessStatePersistence()),
    new MemoryEvidenceStore("owner"),
  );
  const taskA = await harness.tasks.create("conversation-a", "Schedule mail loop");
  const taskB = await harness.tasks.create("conversation-b", "Risk deadline loop");
  await grantMail(harness, taskA);
  await grantMail(harness, taskB);
  const controllerA = controllerFor("conversation-a", harness);
  const controllerB = controllerFor("conversation-b", harness);

  const runA = await harness.tasks.startRun({ taskId: taskA.id, wakeCause: "user" });
  const [fromA] = await controllerA.fetch({ connectionId: "gmail-1" });
  assert.ok(fromA);
  await harness.tasks.finishRun({
    taskId: taskA.id, runId: runA.id, taskStatus: "waiting",
    waiting: null, stopReason: "test_wait",
  });
  const [eventA] = await harness.events.all(taskA.id);
  assert.equal(eventA?.id, fromA.eventId);

  await harness.tasks.startRun({ taskId: taskB.id, wakeCause: "user" });
  const [fromB] = await controllerB.fetch({ connectionId: "gmail-1" });
  assert.ok(fromB);
  assert.notEqual(fromB.eventId, fromA.eventId);
  assert.equal((await controllerB.readEvent(fromB.eventId)).sourceMessageId, "message-1");
  const eventsB = await harness.events.all(taskB.id);
  assert.equal(eventsB.length, 1);
  assert.equal(eventsB[0]?.id, fromB.eventId);
  assert.equal(eventsB[0]?.taskId, taskB.id);

  const afterA = await harness.events.get(taskA.id, fromA.eventId);
  assert.equal(afterA.deliveryAttempts, eventA!.deliveryAttempts);
  assert.equal(afterA.deliveredAt, eventA!.deliveredAt);
  assert.equal((await harness.events.all(taskA.id)).length, 1);

  await assert.rejects(
    harness.signals.assertAllMailEventsClassified(taskB.id),
    /邮件未分类/u,
  );
  await controllerB.record({
    eventId: fromB.eventId, kind: "application_confirmation", confidence: 95,
    applicationId: "application-1", rationale: "Receipt is confirmed explicitly.",
    evidenceQuotes: ["We received your application"],
  });
  await harness.signals.assertAllMailEventsClassified(taskB.id);

  const again = await controllerB.fetch({ connectionId: "gmail-1" });
  assert.equal(again[0]?.eventId, fromB.eventId);
  assert.equal((await harness.events.all(taskB.id)).length, 1);
});

test("EnvironmentEventStore still dedupes the same key within one task", async () => {
  const harness = new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository("owner", new MemoryAgentHarnessStatePersistence()),
  );
  const taskA = await harness.tasks.create("conversation-a", "Loop A");
  const taskB = await harness.tasks.create("conversation-b", "Loop B");
  const draft = {
    source: "mail" as const, type: "mail.message_received",
    trust: "external_untrusted" as const, occurredAt: "2026-08-22T10:00:00.000Z",
    dedupeKey: "mail:gmail:gmail-1:message-1", payloadRef: null, payloadHash: "hash",
  };
  const first = await harness.events.enqueue({ ...draft, taskId: taskA.id });
  const repeat = await harness.events.enqueue({ ...draft, taskId: taskA.id });
  const other = await harness.events.enqueue({ ...draft, taskId: taskB.id });
  assert.equal(repeat.id, first.id);
  assert.notEqual(other.id, first.id);
  assert.equal(other.taskId, taskB.id);
  assert.equal((await harness.events.all(taskA.id)).length, 1);
  assert.equal((await harness.events.all(taskB.id)).length, 1);
});

async function grantMail(harness: AgentHarnessServices, task: AgentTaskV1): Promise<void> {
  const now = Date.now();
  await harness.grants.create({
    ownerId: "owner", taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: [], blockedDomains: [],
    allowedActions: ["mail.read", "mail.classify", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {},
    connectorPolicy: { mailConnectionIds: ["gmail-1"] },
    submissionBudget: {}, unattended: true,
    validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    policyVersion: "be5", confirmedByUserAt: new Date(now).toISOString(),
  });
}

function controllerFor(
  conversationId: string,
  harness: AgentHarnessServices,
): InboxSignalController {
  const gmail: MailConnection = {
    id: "gmail-1", provider: "gmail", accountEmail: "gmail-1@example.com",
    accessToken: async () => "token",
  };
  // Each task keeps its own cursor, so a fresh task re-reads the overlap window.
  const adapter: InboxIncrementalAdapter = {
    provider: "gmail",
    fetch: async ({ connection: selected }) => ({
      messages: [{ ...message, connectionId: selected.id }], cursor: "101",
    }),
  };
  return new InboxSignalController(
    conversationId, harness,
    { get: async (id) => {
      if (id !== gmail.id) throw new Error("connection missing");
      return gmail;
    }, list: async () => [gmail] },
    [adapter],
    { getApplication: async (id) => {
      if (id !== "application-1") throw new Error("application missing");
      return { id };
    } },
  );
}

const message: InboxMessagePayloadV1 = {
  version: 1, provider: "gmail", connectionId: "gmail-1",
  direction: "received",
  sourceMessageId: "message-1", internetMessageId: "<message-1@example.com>",
  sender: "jobs@example.com", subject: "Application received",
  receivedAt: "2026-08-22T10:00:00.000Z",
  bodyText: "We received your application for Backend Engineer.",
};

class MemoryEvidenceStore implements AgentEvidenceStore {
  readonly #values = new Map<string, AgentEvidenceV1>();
  public constructor(private readonly ownerId: string) {}

  public async save(
    input: Omit<AgentEvidenceV1, "version" | "id" | "ownerId">,
  ): Promise<AgentEvidenceV1> {
    const value: AgentEvidenceV1 = {
      version: 1, id: `00000000-0000-7000-8000-${String(this.#values.size).padStart(12, "0")}`,
      ownerId: this.ownerId, ...structuredClone(input),
    };
    this.#values.set(value.id, value);
    return structuredClone(value);
  }

  public async read(id: string): Promise<AgentEvidenceV1 | undefined> {
    const value = this.#values.get(id);
    return value ? structuredClone(value) : undefined;
  }
  public async clearExpired(): Promise<number> { return 0; }
  public async clearAll(): Promise<void> { this.#values.clear(); }
}
