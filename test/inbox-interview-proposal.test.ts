import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { InboxSignalInterviewService } from "../src/desktop/main/agent-task/inbox-signal-interview-service.js";
import type { ApplicationSyncStore } from "../src/desktop/main/application-library/application-sync-store.js";
import { InterviewProposalService } from "../src/desktop/main/tracker/interview-proposal-service.js";
import type { InterviewSyncStore } from "../src/desktop/main/tracker/interview-sync-store.js";
import type { InterviewInput, InterviewRound } from "../src/tracker/child-types.js";

test("Inbox interview invite requires time/zone and reuses Interview Proposal once", async () => {
  const value = await setup();
  await assert.rejects(value.service.prepare({
    signalId: value.inviteSignalId, mutation: "create",
    value: { ...interviewInput, scheduledAt: null },
  }), /完整时间或时区/u);

  const proposal = await value.service.prepare({
    signalId: value.inviteSignalId, mutation: "create", value: interviewInput,
  });
  assert.equal(value.createCalls, 0);
  const interview = await value.service.execute(proposal.id);
  assert.equal(interview.applicationId, "application-1");
  assert.equal(interview.timezone, "Asia/Hong_Kong");
  assert.equal(value.createCalls, 1);
  await value.service.execute(proposal.id);
  assert.equal(value.createCalls, 1);
});

test("Inbox interview change must target the same Application round", async () => {
  const value = await setup();
  const proposal = await value.service.prepare({
    signalId: value.changeSignalId, mutation: "update",
    interviewId: "interview-1",
    value: { ...interviewInput, scheduledAt: "2026-08-25T10:00:00Z" },
  });
  const updated = await value.service.execute(proposal.id);
  assert.equal(updated.scheduledAt, "2026-08-25T10:00:00Z");
  assert.equal(value.updateCalls, 1);
});

test("confirmed sent mail can create an App interview schedule", async () => {
  const value = await setup();
  const proposal = await value.service.prepare({
    signalId: value.scheduleSignalId, mutation: "create", value: interviewInput,
  });
  const created = await value.service.execute(proposal.id);
  assert.equal(created.scheduledAt, interviewInput.scheduledAt);
  assert.equal(value.createCalls, 1);
});

const interviewInput: InterviewInput = {
  roundNumber: 1, interviewType: "video",
  scheduledAt: "2026-08-24T10:00:00Z", timezone: "Asia/Hong_Kong",
  durationMinutes: 60, locationOrLink: "https://meet.example/interview",
  interviewer: null, status: "scheduled",
};

async function setup() {
  const harness = new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository("owner", new MemoryAgentHarnessStatePersistence()),
  );
  const task = await harness.tasks.create("conversation", "Track interviews");
  const now = Date.now();
  await harness.grants.create({
    ownerId: "owner", taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: [], blockedDomains: [],
    allowedActions: ["tracker.interview.update", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {},
    connectorPolicy: { appSchedule: true, scheduleMailDirections: ["received", "sent"] },
    submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be5",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const inviteSignalId = await signal(harness, task.id, "interview_invite", "invite");
  const changeSignalId = await signal(harness, task.id, "interview_change", "change");
  const scheduleSignalId = await signal(
    harness, task.id, "interview_schedule", "schedule", "sent",
  );
  let current = round(interviewInput);
  let createCalls = 0;
  let updateCalls = 0;
  const interviews = {
    get: async (id: string) => {
      if (id !== current.id) throw new Error("missing interview");
      return structuredClone(current);
    },
    create: async (_applicationId: string, input: InterviewInput, id: string) => {
      createCalls += 1;
      current = round(input, id);
      return structuredClone(current);
    },
    update: async (_id: string, input: InterviewInput) => {
      updateCalls += 1;
      current = { ...current, ...structuredClone(input), entityVersion: current.entityVersion + 1 };
      return structuredClone(current);
    },
  } as unknown as InterviewSyncStore;
  const service = new InboxSignalInterviewService(
    "conversation", harness,
    { getApplication: async () => ({
      id: "application-1", companyName: "Acme", roleName: "Backend Engineer",
      status: "interviewing",
    }) } as unknown as ApplicationSyncStore,
    interviews, new InterviewProposalService(interviews),
  );
  return {
    service, inviteSignalId, changeSignalId, scheduleSignalId,
    get createCalls() { return createCalls; },
    get updateCalls() { return updateCalls; },
  };
}

async function signal(
  harness: AgentHarnessServices,
  taskId: string,
  kind: "interview_invite" | "interview_change" | "interview_schedule",
  key: string,
  direction: "received" | "sent" = "received",
): Promise<string> {
  const event = await harness.events.enqueue({
    taskId, source: "mail",
    type: direction === "sent" ? "mail.message_sent" : "mail.message_received",
    trust: "external_untrusted", occurredAt: "2026-08-22T10:00:00Z",
    dedupeKey: key, payloadRef: null, payloadHash: key,
  });
  return (await harness.signals.record({
    taskId, eventId: event.id, provider: "gmail", connectionId: "gmail-1",
    direction,
    sourceMessageId: key, sourceMessageHash: key,
    sender: "jobs@example.com", subject: kind,
    receivedAt: "2026-08-22T10:00:00Z", kind, confidence: 96,
    applicationId: "application-1", rationale: "Explicit interview mail",
    evidenceQuotes: [kind],
  })).id;
}

function round(input: InterviewInput, id = "interview-1"): InterviewRound {
  return {
    id, applicationId: "application-1", entityVersion: 1,
    roundNumber: input.roundNumber, interviewType: input.interviewType,
    scheduledAt: input.scheduledAt ?? null, timezone: input.timezone,
    durationMinutes: input.durationMinutes ?? null,
    locationOrLink: input.locationOrLink ?? null, interviewer: input.interviewer ?? null,
    status: input.status, createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z", deletedAt: null, syncStatus: "pending",
  };
}
