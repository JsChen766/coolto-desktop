import type { JdReader } from "../../../api/types.js";
import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import { canonicalHash } from "../../../agent-task/canonical-hash.js";
import type { JsonValue } from "../../../agent-task/json-types.js";
import type { SubmissionIntentV1, SubmissionReceiptV1 } from "../../../agent-task/submission-types.js";
import type { BrowserAgentController } from "../../../browser/agent-control-types.js";
import type { ResumePublicationGateway } from "../../../resume/save/types.js";
import type { ApplicationCreateInput } from "../../../tracker/types.js";
import type { ApplicationProposalService } from "../application-library/application-proposal-service.js";
import type { ManagedResumeUploadService } from "./managed-resume-upload-service.js";
export class ApplicationSubmissionService {
  public constructor(
    private readonly conversationId: string,
    private readonly harness: AgentHarnessServices,
    private readonly browser: BrowserAgentController,
    private readonly jds: JdReader,
    private readonly resumes: ResumePublicationGateway,
    private readonly applications: ApplicationProposalService,
    private readonly uploads: ManagedResumeUploadService,
  ) {}
  public async prepare(input: {
    jdId: string;
    resumeId: string;
    targetUrl: string;
    submitFillId: string;
  }): Promise<SubmissionIntentV1> {
    const task = await this.#runningTask();
    const active = await this.harness.grants.getActive(task.id);
    if (!active.grant || active.revocation ||
        !active.grant.allowedActions.includes("browser.submit") ||
        !active.grant.allowedActions.includes("tracker.application.create")) {
      throw new Error("DelegationGrant 未同时授权 browser.submit 和 Tracker 创建");
    }
    if (active.grant.assetPolicy.submissionMode !== "confirm_each" ||
        active.grant.assetPolicy.resumeId !== input.resumeId ||
        typeof active.grant.assetPolicy.resumeTitle !== "string" ||
        typeof active.grant.assetPolicy.resumeContentHash !== "string") {
      throw new Error("本次投递必须使用 DelegationGrant 冻结的简历并逐次确认");
    }
    const [jd, resume] = await Promise.all([
      this.jds.getJd(input.jdId),
      this.resumes.getResume(input.resumeId),
    ]);
    if (active.grant.assetPolicy.resumeTitle !== resume.title ||
        active.grant.assetPolicy.resumeContentHash !== resume.contentHash) {
      throw new Error("DelegationGrant 冻结的 Resume 标题或版本已变化");
    }
    if (resume.qualityStatus !== "passed" || resume.status === "archived" ||
        !/^[0-9a-f]{64}$/u.test(resume.contentHash)) {
      throw new Error("实际投递 Resume 未通过质量门槛、已归档或缺少有效 hash");
    }
    const tab = this.browser.getActiveTab();
    if (!tab?.url || new URL(tab.url).origin !== new URL(input.targetUrl).origin) {
      throw new Error("当前标签页与目标投递 URL origin 不一致");
    }
    const applicationInput = createApplicationInput({
      jdId: jd.id,
      resumeId: resume.id,
      company: jd.company ?? "未填写公司",
      role: jd.targetRole ?? jd.title,
      targetUrl: input.targetUrl,
      pendingConfirmation: false,
    });
    const proposal = await this.applications.prepareCreate(applicationInput);
    if (proposal.duplicate) throw new Error("同一 JD/Resume 已有投递记录，托管模式拒绝重复投递");
    return this.harness.submissions.createIntent({
      taskId: task.id, runId: task.activeRunId!, actionTokenId: null,
      applicationProposalId: proposal.id, jdId: jd.id, resumeId: resume.id,
      resumeTitle: resume.title, resumeContentHash: resume.contentHash,
      company: applicationInput.companyName, role: applicationInput.roleName,
      targetUrl: new URL(input.targetUrl).toString(), tabId: tab.id,
      submitFillId: input.submitFillId, preparedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
  }
  public async submit(input: {
    intentId: string;
    confirmationKind: "url" | "text" | "element";
    confirmationValue: string;
    timeoutMs?: number;
  }): Promise<SubmissionReceiptV1> {
    let intent = await this.harness.submissions.getIntent(input.intentId);
    if (!intent.confirmedByUserAt || intent.rejectedByUserAt) {
      throw new Error("本次岗位投递尚未获得用户最终确认");
    }
    await this.#assertRunningIntent(intent);
    const existing = await this.#existingReceipt(intent);
    if (existing) return existing;
    if (intent.startedAt) return this.#finalize(intent, false);
    const tab = this.browser.getActiveTab();
    if (!tab?.url || tab.id !== intent.tabId || Date.now() >= Date.parse(intent.expiresAt) ||
        new URL(tab.url).origin !== new URL(intent.targetUrl).origin) {
      throw new Error("SubmissionIntent 已过期或页面上下文已变化");
    }
    intent = await this.#authorize(intent);
    const claim = await this.harness.submissions.claimIntent(
      intent.id, new Date().toISOString(),
    );
    intent = claim.intent;
    if (!claim.claimed) {
      return (await this.#existingReceipt(intent)) ?? this.#finalize(intent, false);
    }
    let confirmed = true;
    try {
      await this.browser.submitElement(intent.submitFillId);
      await this.browser.waitFor({
        kind: input.confirmationKind,
        value: input.confirmationValue,
        timeoutMs: input.timeoutMs ?? 15_000,
      });
    } catch { confirmed = false; }
    return this.#finalize(intent, confirmed);
  }
  async #finalize(
    intent: SubmissionIntentV1,
    confirmed: boolean,
  ): Promise<SubmissionReceiptV1> {
    if (!intent.actionTokenId) throw new Error("SubmissionIntent 缺少提交令牌");
    const action = await this.harness.ledger.consume({
      tokenId: intent.actionTokenId,
      toolCallId: `submission:${intent.id}`,
      targetOrigin: new URL(intent.targetUrl).origin,
      tabId: intent.tabId,
      observationHash: null,
      status: confirmed ? "succeeded" : "uncertain",
      observationAfterHash: null,
      errorCode: confirmed ? null : "submission_confirmation_uncertain",
    });
    const receipt = await this.harness.submissions.createReceipt({
      taskId: intent.taskId, runId: intent.runId, intentId: intent.id,
      actionReceiptId: action.id, jdId: intent.jdId, resumeId: intent.resumeId,
      resumeContentHash: intent.resumeContentHash, company: intent.company,
      role: intent.role, targetUrl: intent.targetUrl, siteApplicationId: null,
      status: confirmed ? "confirmed" : "pending", applicationId: null,
      createdAt: new Date().toISOString(),
    });
    await this.syncToTracker(intent, receipt).catch(() => undefined);
    const result = (await this.harness.submissions.list(intent.taskId))
      .find((value) => value.id === receipt.id)!;
    await this.uploads.cleanupTask(intent.taskId).catch(() => undefined);
    return result;
  }

  async #existingReceipt(
    intent: SubmissionIntentV1,
  ): Promise<SubmissionReceiptV1 | undefined> {
    if (!intent.submissionReceiptId) return undefined;
    return (await this.harness.submissions.list(intent.taskId))
      .find((value) => value.id === intent.submissionReceiptId);
  }

  async #authorize(intent: SubmissionIntentV1): Promise<SubmissionIntentV1> {
    const task = await this.#runningTask();
    const active = await this.harness.grants.getActive(task.id);
    if (task.id !== intent.taskId || !active.grant || active.revocation) {
      throw new Error("SubmissionIntent 与当前 AgentTask 授权不一致");
    }
    const tab = this.browser.getActiveTab();
    if (!tab?.url || tab.id !== intent.tabId ||
        new URL(tab.url).origin !== new URL(intent.targetUrl).origin) {
      throw new Error("SubmissionIntent 页面上下文已变化");
    }
    const requestHash = canonicalHash({
      taskId: task.id, runId: task.activeRunId!, jdId: intent.jdId,
      resumeId: intent.resumeId, resumeContentHash: intent.resumeContentHash,
      targetUrl: intent.targetUrl, submitFillId: intent.submitFillId,
    } as JsonValue);
    const token = await this.harness.ledger.issue({
      ownerId: task.ownerId, taskId: task.id, runId: task.activeRunId!,
      toolName: "browser_submit", requestHash, grantHash: active.grant.contentHash,
      targetOrigin: new URL(tab.url).origin, tabId: tab.id,
      observationHash: null,
      expiresAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    });
    return this.harness.submissions.authorizeIntent({
      intentId: intent.id, runId: task.activeRunId!,
      actionTokenId: token.id, expiresAt: token.expiresAt,
    });
  }

  async #assertRunningIntent(intent: SubmissionIntentV1): Promise<void> {
    const task = await this.#runningTask();
    const active = await this.harness.grants.getActive(task.id);
    if (task.id !== intent.taskId || !active.grant || active.revocation) {
      throw new Error("SubmissionIntent 与当前 running AgentTask 不一致");
    }
  }

  public async syncToTracker(
    intent: SubmissionIntentV1,
    receipt: SubmissionReceiptV1,
  ): Promise<SubmissionReceiptV1> {
    if (receipt.applicationId) return receipt;
    const proposalId = receipt.status === "confirmed"
      ? intent.applicationProposalId
      : (await this.applications.prepareCreate(createApplicationInput({
          jdId: intent.jdId, resumeId: intent.resumeId,
          company: intent.company, role: intent.role, targetUrl: intent.targetUrl,
          pendingConfirmation: true,
        }))).id;
    const application = await this.applications.execute(proposalId);
    return this.harness.submissions.linkApplication(receipt.id, application.id);
  }

  public async syncReceipt(receiptId: string): Promise<SubmissionReceiptV1> {
    const task = await this.#runningTask();
    const receipt = (await this.harness.submissions.list(task.id))
      .find((value) => value.id === receiptId);
    if (!receipt) throw new Error("SubmissionReceipt 不存在");
    const intent = await this.harness.submissions.getIntent(receipt.intentId);
    return this.syncToTracker(intent, receipt);
  }

  public async confirm(intentId: string): Promise<SubmissionIntentV1> {
    return this.harness.submissions.confirmIntent(
      intentId, new Date().toISOString(),
    );
  }

  public async reject(intentId: string): Promise<SubmissionIntentV1> {
    const intent = await this.harness.submissions.rejectIntent(
      intentId, new Date().toISOString(),
    );
    await this.uploads.cleanupTask(intent.taskId).catch(() => undefined);
    return intent;
  }

  async #runningTask() {
    const task = await this.harness.tasks.findRunningByConversation(this.conversationId);
    if (!task?.activeRunId) throw new Error("Managed Apply 需要 running AgentTask");
    return task;
  }
}

function createApplicationInput(value: {
  jdId: string; resumeId: string; company: string; role: string;
  targetUrl: string; pendingConfirmation: boolean;
}): ApplicationCreateInput {
  return {
    jdId: value.jdId, resumeId: value.resumeId,
    companyName: value.company, roleName: value.role,
    deliveryMethod: "form_fill", targetUrl: value.targetUrl,
    appliedAt: new Date().toISOString(),
    pendingConfirmation: value.pendingConfirmation,
    source: "browser",
    dedupeKey: canonicalHash({
      jdId: value.jdId, resumeId: value.resumeId, targetUrl: value.targetUrl,
    }),
  };
}
