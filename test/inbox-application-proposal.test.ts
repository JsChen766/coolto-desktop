import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import { ActionExecutorRegistry } from "../src/approvals/executor-registry.js";
import { InboxSignalApplicationService } from "../src/desktop/main/agent-task/inbox-signal-application-service.js";
import type { ApplicationSyncStore } from "../src/desktop/main/application-library/application-sync-store.js";
import {
  INBOX_APPLICATION_UPDATE_ACTION,
  createInboxApplicationApprovalDraft,
} from "../src/inbox-signals/inbox-action-approval.js";
import { createInboxApplicationApprovalExecutor } from "../src/inbox-signals/inbox-action-approval-executor.js";
import type { ExternalSignalKind } from "../src/inbox-signals/inbox-signal-types.js";
import type { ApplicationRecord } from "../src/tracker/types.js";

test("Inbox confirmation Proposal writes only after immutable approval", async () => {
  const value = await setup("application_confirmation", true);
  const proposal = await value.service.prepare(value.signalId);
  assert.equal(value.application.pendingConfirmation, true);
  assert.equal((await value.harness.signals.get(value.taskId, value.signalId)).status, "proposed");

  const executors = new ActionExecutorRegistry();
  executors.register(
    INBOX_APPLICATION_UPDATE_ACTION,
    createInboxApplicationApprovalExecutor(value.service),
  );
  const approvals = new ApprovalManager(new ApprovalStore(), executors);
  const request = await approvals.request(
    createInboxApplicationApprovalDraft(proposal),
    { proposalId: proposal.id },
  );
  assert.equal(value.application.pendingConfirmation, true);

  await approvals.resolve(request.id, { type: "accept" });
  assert.equal(value.application.pendingConfirmation, false);
  assert.equal(value.updateCalls, 1);
  assert.equal((await value.harness.signals.get(value.taskId, value.signalId)).status, "applied");
  await value.service.execute(proposal.id);
  assert.equal(value.updateCalls, 1);
});

test("Inbox screening Proposal uses the existing legal transition path", async () => {
  const value = await setup("screening", false);
  const proposal = await value.service.prepare(value.signalId);
  assert.equal(proposal.targetStatus, "screening");
  assert.equal(value.application.status, "applied");

  await value.service.execute(proposal.id);
  assert.equal(value.application.status, "screening");
  assert.equal(value.transitionCalls, 1);
});

test("Inbox Proposal rejects drift and unlinked signals", async () => {
  const value = await setup("screening", false);
  const proposal = await value.service.prepare(value.signalId);
  value.application.entityVersion += 1;
  await assert.rejects(value.service.execute(proposal.id), /已变化/u);

  const unlinked = await recordSignal(
    value.harness, value.taskId, "screening", null, "mail-unlinked",
  );
  await assert.rejects(value.service.prepare(unlinked), /尚未可靠关联/u);
});

async function setup(kind: ExternalSignalKind, pendingConfirmation: boolean) {
  const harness = new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository("owner", new MemoryAgentHarnessStatePersistence()),
  );
  const task = await harness.tasks.create("conversation", "Track recruiting mail");
  const now = Date.now();
  await harness.grants.create({
    ownerId: "owner", taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: [], blockedDomains: [],
    allowedActions: ["tracker.application.update", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be5",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const application: ApplicationRecord = {
    id: "application-1", jdId: "jd-1", resumeId: "resume-1",
    companyName: "Acme", roleName: "Backend Engineer",
    jdTitleSnapshot: "Backend Engineer", resumeTitleSnapshot: "Resume",
    resumeContentHashSnapshot: "a".repeat(64), deliveryMethod: "form_fill",
    targetUrl: "https://jobs.example/apply", appliedAt: "2026-08-20T00:00:00Z",
    status: "applied", pendingConfirmation, source: "browser", dedupeKey: "key",
    companyBusiness: null, roleSummary: null, companyCulture: null,
    rejectionReason: null, entityVersion: 1, createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z", deletedAt: null, syncStatus: "clean",
  };
  let updateCalls = 0;
  let transitionCalls = 0;
  const applications = {
    getApplication: async () => structuredClone(application),
    updateApplication: async (_id: string, input: { pendingConfirmation: boolean }) => {
      updateCalls += 1;
      application.pendingConfirmation = input.pendingConfirmation;
      application.entityVersion += 1;
      return structuredClone(application);
    },
    transitionApplication: async (_id: string, input: { toStatus: ApplicationRecord["status"] }) => {
      transitionCalls += 1;
      application.status = input.toStatus;
      application.entityVersion += 1;
      return structuredClone(application);
    },
  } as unknown as ApplicationSyncStore;
  const signalId = await recordSignal(
    harness, task.id, kind, application.id, `mail-${kind}`,
  );
  const service = new InboxSignalApplicationService(
    "conversation", harness, applications,
  );
  return {
    harness, taskId: task.id, application, signalId, service,
    get updateCalls() { return updateCalls; },
    get transitionCalls() { return transitionCalls; },
  };
}

async function recordSignal(
  harness: AgentHarnessServices,
  taskId: string,
  kind: ExternalSignalKind,
  applicationId: string | null,
  dedupeKey: string,
): Promise<string> {
  const event = await harness.events.enqueue({
    taskId, source: "mail", type: "mail.message_received",
    trust: "external_untrusted", occurredAt: "2026-08-22T10:00:00Z",
    dedupeKey, payloadRef: null, payloadHash: "hash",
  });
  const signal = await harness.signals.record({
    taskId, eventId: event.id, provider: "gmail", connectionId: "gmail-1",
    sourceMessageId: dedupeKey, sourceMessageHash: "hash",
    sender: "jobs@example.com", subject: kind,
    receivedAt: "2026-08-22T10:00:00Z", kind, confidence: 95,
    applicationId, rationale: "Explicit recruiting status message.",
    evidenceQuotes: [kind],
  });
  return signal.id;
}
