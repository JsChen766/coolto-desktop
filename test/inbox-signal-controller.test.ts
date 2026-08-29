import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import type { AgentEvidenceStore, AgentEvidenceV1 } from "../src/agent-task/evidence-types.js";
import { TaskLifecycleController } from "../src/agent-task/task-lifecycle-controller.js";
import { InboxSignalController } from "../src/inbox-signals/inbox-signal-controller.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import type {
  InboxIncrementalAdapter,
  InboxMessagePayloadV1,
  MailConnection,
} from "../src/inbox-signals/inbox-signal-types.js";

test("Inbox controller persists encrypted events, dedupes and records grounded signals", async () => {
  const value = await setup();
  const first = await value.controller.fetch({ connectionId: "gmail-1" });
  const second = await value.controller.fetch({ connectionId: "gmail-1" });
  assert.equal(first.length, 1);
  assert.equal(second[0]?.eventId, first[0]?.eventId);
  assert.equal((await value.harness.events.all(value.taskId)).length, 1);

  const message = await value.controller.readEvent(first[0]!.eventId);
  assert.equal(message.bodyText, "We received your application for Backend Engineer.");
  const signal = await value.controller.record({
    eventId: first[0]!.eventId, kind: "application_confirmation",
    confidence: 96, applicationId: "application-1",
    rationale: "The subject and body explicitly confirm receipt.",
    evidenceQuotes: ["We received your application"],
  });
  assert.equal(signal.applicationId, "application-1");
  assert.equal(signal.status, "classified");
  assert.equal((await value.controller.list()).length, 1);
  await assert.rejects(value.controller.record({
    eventId: first[0]!.eventId, kind: "offer", confidence: 99,
    applicationId: "application-1", rationale: "Changed classification",
    evidenceQuotes: ["We received your application"],
  }), /不能静默改写/u);
});

test("Inbox controller rejects unselected connections and fabricated evidence", async () => {
  const value = await setup();
  await assert.rejects(
    value.controller.fetch({ connectionId: "outlook-2" }),
    /未包含在当前 DelegationGrant/u,
  );
  const [event] = await value.controller.fetch({ connectionId: "gmail-1" });
  await assert.rejects(value.controller.record({
    eventId: event!.eventId, kind: "offer", confidence: 90,
    applicationId: "application-1", rationale: "Unsupported",
    evidenceQuotes: ["You have an offer"],
  }), /逐字来自当前邮件/u);
});

test("AgentTask cannot wait while a delivered mail event is unclassified", async () => {
  const value = await setup();
  await value.controller.fetch({ connectionId: "gmail-1" });
  const lifecycle = new TaskLifecycleController("conversation", value.harness);
  await assert.rejects(lifecycle.wait({
    reason: "timer", summary: "wait for more mail",
  }), /邮件未分类/u);
});

test("Browser Webmail captures only exact visible mail text and dedupes the message", async () => {
  const value = await setup();
  const input = {
    sender: "recruiter@example.com", subject: "Interview invitation",
    receivedAt: "2026-08-22T10:00:00.000Z",
    receivedAtEvidence: "Aug 22, 10:00",
    bodyText: "Your interview is scheduled for Monday at 10:00 HKT.",
  };
  const first = await value.controller.captureBrowser(input);
  const second = await value.controller.captureBrowser(input);
  assert.equal(first.provider, "browser_webmail");
  assert.equal(second.eventId, first.eventId);
  assert.equal((await value.harness.events.all(value.taskId)).length, 1);
  await assert.rejects(value.controller.captureBrowser({
    ...input, bodyText: "Fabricated offer text",
  }), /必须逐字来自当前页面/u);
});

test("Browser Webmail keeps distinct messages when a SPA reuses the same URL and envelope", async () => {
  const value = await setup();
  const shared = {
    sender: "recruiter@example.com", subject: "Application update",
    receivedAt: "2026-08-22T10:00:00.000Z",
    receivedAtEvidence: "Aug 22, 10:00",
  };
  const first = await value.controller.captureBrowser({
    ...shared, bodyText: "Your application is under review.",
  });
  value.setBrowserText([
    shared.sender, shared.subject, shared.receivedAtEvidence,
    "Please select an interview time.",
  ].join("\n"));
  const second = await value.controller.captureBrowser({
    ...shared, bodyText: "Please select an interview time.",
  });
  assert.notEqual(second.eventId, first.eventId);
  assert.equal((await value.harness.events.all(value.taskId)).length, 2);
});

async function setup() {
  const evidence = new MemoryEvidenceStore("owner");
  const harness = new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository("owner", new MemoryAgentHarnessStatePersistence()),
    evidence,
  );
  const task = await harness.tasks.create("conversation", "Track recruiting mail");
  const now = Date.now();
  await harness.grants.create({
    ownerId: "owner", taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["mail.example"], blockedDomains: [],
    allowedActions: ["browser.read", "mail.read", "mail.classify", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {},
    connectorPolicy: { browserWebmail: true, mailConnectionIds: ["gmail-1"] },
    submissionBudget: {}, unattended: true,
    validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    policyVersion: "be5", confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const connections = new Map<string, MailConnection>([
    ["gmail-1", connection("gmail-1", "gmail")],
    ["outlook-2", connection("outlook-2", "outlook")],
  ]);
  const adapter: InboxIncrementalAdapter = {
    provider: "gmail",
    fetch: async ({ connection: selected }) => ({
      messages: [{ ...message, connectionId: selected.id }], cursor: "101",
    }),
  };
  let browserText = [
    "recruiter@example.com", "Interview invitation", "Aug 22, 10:00",
    "Your interview is scheduled for Monday at 10:00 HKT.",
    "Application update", "Your application is under review.",
  ].join("\n");
  const controller = new InboxSignalController(
    "conversation", harness,
    { get: async (id) => {
      const selected = connections.get(id);
      if (!selected) throw new Error("connection missing");
      return selected;
    } },
    [adapter],
    { getApplication: async (id) => {
      if (id !== "application-1") throw new Error("application missing");
      return { id };
    } },
    {
      snapshot: async () => ({
        tab: {
          id: "tab-mail", title: "Inbox", url: "https://mail.example/message/1",
          isActive: true, isLoading: false, canGoBack: true, canGoForward: false,
        },
        page: {
          url: "https://mail.example/message/1", title: "Interview invitation",
          metaDescription: "", ogTitle: "", ogDescription: "",
          text: browserText,
          textTruncated: false, formFields: [],
        },
        accessibility: [], accessibilityTruncated: false,
      }),
    } as unknown as BrowserAgentController,
    () => true,
  );
  return {
    harness, controller, taskId: task.id,
    setBrowserText: (value: string) => { browserText = value; },
  };
}

const message: InboxMessagePayloadV1 = {
  version: 1, provider: "gmail", connectionId: "gmail-1",
  sourceMessageId: "message-1", internetMessageId: "<message-1@example.com>",
  sender: "jobs@example.com", subject: "Application received",
  receivedAt: "2026-08-22T10:00:00.000Z",
  bodyText: "We received your application for Backend Engineer.",
};

function connection(id: string, provider: "gmail" | "outlook"): MailConnection {
  return { id, provider, accountEmail: `${id}@example.com`, accessToken: async () => "token" };
}

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
