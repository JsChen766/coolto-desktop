import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import { ApplicationSubmissionService } from "../src/desktop/main/agent-task/application-submission-service.js";
import type { ApplicationProposalService } from "../src/desktop/main/application-library/application-proposal-service.js";
import type { ApplicationCreateInput, ApplicationRecord } from "../src/tracker/types.js";
import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import { createApplicationSubmissionTools } from
  "../src/tools/application-submission-tools.js";

test("confirmed browser submit creates one receipt and one Tracker Application", async () => {
  const value = await setup(false);
  const intent = await value.submissions.prepare({
    jdId: "jd-1", resumeId: "resume-1",
    targetUrl: "https://jobs.example/apply", submitFillId: "submit-1",
  });
  await value.submissions.confirm(intent.id);
  const receipt = await value.submissions.submit({
    intentId: intent.id, confirmationKind: "text",
    confirmationValue: "Application received",
  });
  assert.equal(receipt.status, "confirmed");
  assert.equal(receipt.applicationId, "application-1");
  assert.equal(value.submitCalls.length, 1);
  assert.equal(value.applicationInputs[0]?.pendingConfirmation, false);
  assert.equal((await value.submissions.submit({
    intentId: intent.id, confirmationKind: "text",
    confirmationValue: "Application received",
  })).id, receipt.id);
  assert.equal(value.submitCalls.length, 1);
});

test("uncertain submit creates pending-confirmation Application without resubmitting", async () => {
  const value = await setup(true);
  const intent = await value.submissions.prepare({
    jdId: "jd-1", resumeId: "resume-1",
    targetUrl: "https://jobs.example/apply", submitFillId: "submit-1",
  });
  await value.submissions.confirm(intent.id);
  const receipt = await value.submissions.submit({
    intentId: intent.id, confirmationKind: "text", confirmationValue: "received",
  });
  assert.equal(receipt.status, "pending");
  assert.equal(receipt.applicationId, "application-1");
  assert.equal(value.applicationInputs.at(-1)?.pendingConfirmation, true);
});

test("submission preparation rejects duplicate Application and unqualified Resume", async () => {
  const duplicate = await setup(false, true);
  await assert.rejects(
    duplicate.submissions.prepare({
      jdId: "jd-1", resumeId: "resume-1",
      targetUrl: "https://jobs.example/apply", submitFillId: "submit-1",
    }), /重复投递/u,
  );
  const unqualified = await setup(false, false, "needs_revision");
  await assert.rejects(
    unqualified.submissions.prepare({
      jdId: "jd-1", resumeId: "resume-1",
      targetUrl: "https://jobs.example/apply", submitFillId: "submit-1",
    }), /质量门槛/u,
  );
});

test("each submission stays blocked until the selected Resume is confirmed", async () => {
  const value = await setup(false);
  const intent = await value.submissions.prepare({
    jdId: "jd-1", resumeId: "resume-1",
    targetUrl: "https://jobs.example/apply", submitFillId: "submit-1",
  });
  await assert.rejects(value.submissions.submit({
    intentId: intent.id, confirmationKind: "text", confirmationValue: "received",
  }), /最终确认/u);
  await value.submissions.reject(intent.id);
  await assert.rejects(value.submissions.submit({
    intentId: intent.id, confirmationKind: "text", confirmationValue: "received",
  }), /最终确认/u);
  await assert.rejects(value.submissions.prepare({
    jdId: "jd-1", resumeId: "resume-other",
    targetUrl: "https://jobs.example/apply", submitFillId: "submit-1",
  }), /冻结的简历/u);
  assert.equal(value.submitCalls.length, 0);
});

test("prepare tool creates a per-job approval before browser_submit", async () => {
  const value = await setup(false);
  const approvals = createActionApprovalManager({
    experienceWriter: {} as never,
    importProposalStore: new ExperienceImportProposalStore(),
    applicationSubmissions: value.submissions,
  });
  const prepare = createApplicationSubmissionTools(value.submissions, approvals)[0]!;
  const result = await prepare.execute("prepare", {
    jdId: "jd-1", resumeId: "resume-1",
    targetUrl: "https://jobs.example/apply", submitFillId: "submit-1",
  });
  const details = result.details as { intent: { id: string }; approvalRequestId: string };
  assert.equal(approvals.listPending()[0]?.actionType, "browser.submission_confirm");
  await approvals.resolve(details.approvalRequestId, { type: "accept" });
  assert.ok((await value.harness.submissions.getIntent(details.intent.id)).confirmedByUserAt);
});

test("started SubmissionIntent reconciles to pending without a second site click", async () => {
  const value = await setup(false);
  const intent = await value.submissions.prepare({
    jdId: "jd-1", resumeId: "resume-1",
    targetUrl: "https://jobs.example/apply", submitFillId: "submit-1",
  });
  await value.submissions.confirm(intent.id);
  const task = await value.harness.tasks.findRunningByConversation("conversation");
  const active = await value.harness.grants.getActive(task!.id);
  const token = await value.harness.ledger.issue({
    ownerId: "owner", taskId: task!.id, runId: task!.activeRunId!,
    toolName: "browser_submit", requestHash: "recovery-token",
    grantHash: active.grant!.contentHash, targetOrigin: "https://jobs.example",
    tabId: "tab-1", observationHash: null,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  });
  await value.harness.submissions.authorizeIntent({
    intentId: intent.id, runId: task!.activeRunId!,
    actionTokenId: token.id, expiresAt: token.expiresAt,
  });
  await value.harness.submissions.claimIntent(intent.id, new Date().toISOString());
  await value.harness.tasks.setHostStatus(task!.id, "paused");
  await value.harness.ledger.reconcileInvalidatedRun(
    task!.id, task!.activeRunId!, "run_interrupted_before_receipt",
  );
  await assert.rejects(value.submissions.submit({
    intentId: intent.id, confirmationKind: "text", confirmationValue: "received",
  }), /running AgentTask/u);
  await value.harness.tasks.startRun({ taskId: task!.id, wakeCause: "user" });

  const receipt = await value.submissions.submit({
    intentId: intent.id, confirmationKind: "text", confirmationValue: "received",
  });
  assert.equal(receipt.status, "pending");
  assert.equal(value.submitCalls.length, 0);
  assert.equal(receipt.applicationId, "application-1");
});

test("deleting an Application removes its retained submission intent and receipt", async () => {
  const value = await setup(false);
  const intent = await value.submissions.prepare({
    jdId: "jd-1", resumeId: "resume-1",
    targetUrl: "https://jobs.example/apply", submitFillId: "submit-1",
  });
  await value.submissions.confirm(intent.id);
  const receipt = await value.submissions.submit({
    intentId: intent.id, confirmationKind: "text", confirmationValue: "received",
  });
  assert.ok(await value.harness.submissions.findByApplication("application-1"));

  await value.harness.submissions.deleteByApplication("application-1");
  assert.equal(await value.harness.submissions.findByApplication("application-1"), undefined);
  await assert.rejects(
    value.harness.submissions.getIntent(receipt.intentId),
    /不存在/u,
  );
});

async function setup(
  waitFails: boolean,
  duplicate = false,
  qualityStatus: "passed" | "needs_revision" = "passed",
) {
  const ownerId = "owner";
  const harness = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await harness.tasks.create("conversation", "Apply to role");
  const now = Date.now();
  await harness.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["browser.submit", "tracker.application.create", "task.lifecycle"],
    jobCriteria: {},
    assetPolicy: {
      resumeId: "resume-1", resumeTitle: "Resume",
      resumeContentHash: "a".repeat(64), submissionMode: "confirm_each",
    },
    answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be4",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const submitCalls: string[] = [];
  const browser = {
    getActiveTab: () => ({
      id: "tab-1", title: "Apply", url: "https://jobs.example/apply",
      isActive: true, isLoading: false, canGoBack: false, canGoForward: false,
    }),
    submitElement: async (fillId: string) => { submitCalls.push(fillId); },
    waitFor: async () => {
      if (waitFails) throw new Error("timeout");
      return { condition: "text", elapsedMs: 1,
        tab: { id: "tab-1" } } as never;
    },
  } as unknown as BrowserAgentController;
  const applicationInputs: ApplicationCreateInput[] = [];
  let proposalSequence = 0;
  const proposals = {
    prepareCreate: async (input: ApplicationCreateInput) => {
      applicationInputs.push(structuredClone(input));
      proposalSequence += 1;
      return {
        id: `proposal-${proposalSequence}`, kind: "create", applicationId: null,
        companyName: input.companyName, roleName: input.roleName,
        jd: { id: "jd-1", title: "Backend Engineer" },
        resume: { id: "resume-1", title: "Resume" },
        previousJd: null, previousResume: null,
        resumeContentHashSnapshot: "a".repeat(64),
        duplicate: duplicate ? { count: 1, latestStatus: "applied", latestAppliedAt: null } : null,
        preparedAt: new Date().toISOString(),
      } as const;
    },
    execute: async (): Promise<ApplicationRecord> => ({
      id: "application-1", jdId: "jd-1", resumeId: "resume-1",
      companyName: "Acme", roleName: "Backend Engineer",
      jdTitleSnapshot: "Backend Engineer", resumeTitleSnapshot: "Resume",
      resumeContentHashSnapshot: "a".repeat(64), deliveryMethod: "form_fill",
      targetUrl: "https://jobs.example/apply", appliedAt: new Date().toISOString(),
      status: "applied", pendingConfirmation: waitFails, source: "browser",
      dedupeKey: "dedupe", companyBusiness: null, roleSummary: null,
      companyCulture: null, rejectionReason: null, entityVersion: 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      deletedAt: null, syncStatus: "pending",
    }),
  } as unknown as ApplicationProposalService;
  const submissions = new ApplicationSubmissionService(
    "conversation", harness, browser,
    { getJd: async () => ({
      id: "jd-1", title: "Backend Engineer", company: "Acme",
      targetRole: "Backend Engineer",
    }) } as never,
    { getResume: async () => ({
      id: "resume-1", title: "Resume", contentHash: "a".repeat(64),
      qualityStatus, status: "active",
    }) } as never,
    proposals, { cleanupTask: async () => undefined } as never,
  );
  return { harness, submissions, submitCalls, applicationInputs };
}
