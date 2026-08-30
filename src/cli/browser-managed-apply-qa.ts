import type { BrowserAgentController } from "../browser/agent-control-types.js";
import type { BrowserPageOperator } from "../browser/types.js";
import { AgentHarnessServices } from "../agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../agent-task/agent-harness-state-repository.js";
import { ApplicationSubmissionService } from "../desktop/main/agent-task/application-submission-service.js";
import type { ApplicationProposalService } from "../desktop/main/application-library/application-proposal-service.js";
import type { ApplicationCreateInput, ApplicationRecord } from "../tracker/types.js";

export async function runManagedApplyQa(input: {
  browser: BrowserAgentController;
  operator: BrowserPageOperator;
  targetUrl: string;
}): Promise<{ receiptStatus: string; applicationCount: number }> {
  const ownerId = "managed-apply-qa";
  const harness = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await harness.tasks.create("conversation-apply", "Apply to QA role");
  const now = Date.now();
  await harness.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["127.0.0.1"], blockedDomains: [],
    allowedActions: ["browser.submit", "tracker.application.create", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be4-qa",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  input.operator.grantWriteAccess("Managed Apply QA");
  const submitFillId = (await input.operator.tagElements())
    .find((item) => item.label === "Submit application")?.fillId;
  if (!submitFillId) throw new Error("QA submit element missing");
  const applicationInputs: ApplicationCreateInput[] = [];
  let applicationCount = 0;
  const proposals = {
    prepareCreate: async (value: ApplicationCreateInput) => {
      applicationInputs.push(structuredClone(value));
      return {
        id: `proposal-${applicationInputs.length}`, kind: "create",
        applicationId: null, companyName: value.companyName,
        roleName: value.roleName,
        jd: { id: "jd-qa", title: "QA Backend Engineer" },
        resume: { id: "resume-qa", title: "QA Resume" },
        previousJd: null, previousResume: null,
        resumeContentHashSnapshot: "b".repeat(64), duplicate: null,
        preparedAt: new Date().toISOString(),
      } as const;
    },
    execute: async (): Promise<ApplicationRecord> => {
      applicationCount += 1;
      return {
        id: "application-qa", jdId: "jd-qa", resumeId: "resume-qa",
        companyName: "QA Company", roleName: "QA Backend Engineer",
        jdTitleSnapshot: "QA Backend Engineer", resumeTitleSnapshot: "QA Resume",
        resumeContentHashSnapshot: "b".repeat(64), deliveryMethod: "form_fill",
        targetUrl: input.targetUrl, appliedAt: new Date().toISOString(),
        status: "applied", pendingConfirmation: false, source: "browser",
        dedupeKey: "qa", companyBusiness: null, roleSummary: null,
        companyCulture: null, rejectionReason: null, entityVersion: 1,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        deletedAt: null, syncStatus: "pending",
      };
    },
  } as unknown as ApplicationProposalService;
  const service = new ApplicationSubmissionService(
    "conversation-apply", harness, input.browser,
    { getJd: async () => ({ id: "jd-qa", title: "QA Backend Engineer",
      company: "QA Company", targetRole: "QA Backend Engineer" }) } as never,
    { getResume: async () => ({ id: "resume-qa", title: "QA Resume",
      contentHash: "b".repeat(64), qualityStatus: "passed", status: "active" }) } as never,
    proposals,
  );
  const intent = await service.prepare({
    jdId: "jd-qa", resumeId: "resume-qa",
    targetUrl: input.targetUrl, submitFillId,
  });
  const receipt = await service.submit({
    intentId: intent.id, confirmationKind: "text",
    confirmationValue: "Application received", timeoutMs: 5_000,
  });
  await service.submit({
    intentId: intent.id, confirmationKind: "text",
    confirmationValue: "Application received", timeoutMs: 5_000,
  });
  return { receiptStatus: receipt.status, applicationCount };
}
