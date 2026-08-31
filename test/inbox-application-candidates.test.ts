import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { InboxApplicationCandidateReader } from
  "../src/inbox-signals/inbox-application-candidate-reader.js";
import type { ApplicationRecord } from "../src/tracker/types.js";
import { createInboxSignalTools } from "../src/tools/inbox-signal-tools.js";
import type { InboxSignalController } from
  "../src/inbox-signals/inbox-signal-controller.js";

test("candidate search issues event-bound refs and excludes unsafe projections", async () => {
  const value = await setup();
  const result = await value.reader.search({
    eventId: value.eventId,
    query: "Example",
    limit: 20,
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.excludedCount, 2);
  assert.deepEqual(
    result.items.map((item) => item.applicationRef),
    ["app_1", "app_2"],
  );
  assert.equal("resumeContentHashSnapshot" in result.items[0]!, false);
  assert.equal(
    await value.reader.resolve(value.eventId, "app_1"),
    "application-clean",
  );

  const repeated = await value.reader.search({ eventId: value.eventId });
  assert.equal(repeated.items[0]?.applicationRef, "app_1");
});

test("candidate refs reject guessing, cross-event reuse and version drift", async () => {
  const value = await setup();
  await value.reader.search({ eventId: value.eventId });
  await assert.rejects(
    value.reader.resolve(value.eventId, "application-clean"),
    /必须来自当前邮件/u,
  );
  const other = await value.harness.events.enqueue(mailEvent(value.taskId, "other"));
  await assert.rejects(
    value.reader.resolve(other.id, "app_1"),
    /必须来自当前邮件/u,
  );
  value.applications[0] = application("application-clean", "clean", 2);
  await assert.rejects(
    value.reader.resolve(value.eventId, "app_1"),
    /已变化/u,
  );
});

test("record tool resolves only the current event app ref", async () => {
  const recorded: Array<Record<string, unknown>> = [];
  const controller = {
    record: async (input: Record<string, unknown>) => {
      recorded.push(input);
      return {
        id: "signal-1", eventId: input.eventId, applicationId: input.applicationId,
      };
    },
  } as unknown as InboxSignalController;
  const candidates = {
    resolve: async (eventId: string, reference: string) => {
      if (eventId !== "event-1" || reference !== "app_1") {
        throw new Error("Application 引用必须来自当前邮件的候选读取");
      }
      return "application-1";
    },
    referenceFor: () => "app_1",
  } as unknown as InboxApplicationCandidateReader;
  const record = createInboxSignalTools(controller, candidates)
    .find((tool) => tool.name === "record_inbox_signal")!;
  const base = {
    eventId: "event-1", kind: "screening", confidence: 95,
    rationale: "Exact company and role", evidenceQuotes: ["under review"],
  };
  const result = await record.execute("record", {
    ...base, applicationRef: "app_1",
  });
  assert.equal(recorded[0]?.applicationId, "application-1");
  assert.equal(JSON.stringify(result.content).includes("application-1"), false);
  assert.match(JSON.stringify(result.content), /app_1/u);
  await assert.rejects(
    record.execute("guess", { ...base, applicationRef: "application-1" }),
    /必须来自当前邮件/u,
  );
});

async function setup() {
  const harness = new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository(
      "owner",
      new MemoryAgentHarnessStatePersistence(),
    ),
  );
  const task = await harness.tasks.create("conversation", "Classify mail");
  const now = Date.now();
  await harness.grants.create({
    ownerId: "owner", taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: [], blockedDomains: [],
    allowedActions: ["mail.read", "mail.classify", "tracker.application.read"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, connectorPolicy: {},
    submissionBudget: {}, unattended: false,
    validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    policyVersion: "be5", confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const event = await harness.events.enqueue(mailEvent(task.id, "current"));
  const applications = [
    application("application-clean", "clean"),
    application("application-pending", "pending"),
    application("application-conflict", "conflict"),
    application("application-failed", "failed"),
  ];
  const reader = new InboxApplicationCandidateReader(
    "conversation",
    harness,
    {
      listApplications: async ({ query }) => ({
        items: applications.filter((item) => !query ||
          `${item.companyName} ${item.roleName}`.includes(query)),
        nextCursor: null,
      }),
      getApplication: async (id) => applications.find((item) => item.id === id)!,
    },
  );
  return { harness, reader, eventId: event.id, taskId: task.id, applications };
}

function mailEvent(taskId: string, suffix: string) {
  return {
    taskId, source: "mail" as const, type: "mail.message_received",
    trust: "external_untrusted" as const,
    occurredAt: new Date().toISOString(), dedupeKey: `mail:${suffix}`,
    payloadRef: `evidence-${suffix}`, payloadHash: `hash-${suffix}`,
  };
}

function application(
  id: string,
  syncStatus: ApplicationRecord["syncStatus"],
  entityVersion = 1,
): ApplicationRecord {
  return {
    id, jdId: null, resumeId: null,
    companyName: "Example", roleName: id.includes("pending") ? "Designer" : "Engineer",
    jdTitleSnapshot: "Example role", resumeTitleSnapshot: "Private resume",
    resumeContentHashSnapshot: "private-hash", deliveryMethod: "manual",
    targetUrl: "https://jobs.example/private", appliedAt: "2026-08-01",
    status: "applied", pendingConfirmation: false, source: "manual",
    dedupeKey: null, companyBusiness: null, roleSummary: null,
    companyCulture: null, rejectionReason: null, entityVersion,
    createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
    deletedAt: null, syncStatus,
  };
}
