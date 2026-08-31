import type { ExperienceReader, JdReader } from "../../../api/types.js";
import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import { canonicalHash } from "../../../agent-task/canonical-hash.js";
import type { JsonValue } from "../../../agent-task/json-types.js";
import type { ResumePublicationGateway } from "../../../resume/save/types.js";
import type { ApplicationRecord } from "../../../tracker/types.js";
import type { ApplicationSyncStore } from "../application-library/application-sync-store.js";
import type { InterviewSyncStore } from "../tracker/interview-sync-store.js";
import type { ReminderProposalService } from "../tracker/reminder-proposal-service.js";
import { assertMailDirectionAllowed } from "../../../inbox-signals/mail-direction-policy.js";
import {
  assertFollowUpSpacing, normalizeFollowUpSchedule,
} from "./ai-native-follow-up-policy.js";
import { validateBriefSourceRefs } from "./ai-native-brief-source-policy.js";
import { buildApplicationStrategySnapshot } from "./ai-native-strategy-metrics.js";

export class AiNativeLoopService {
  public constructor(
    private readonly conversationId: string,
    private readonly harness: AgentHarnessServices,
    private readonly applications: ApplicationSyncStore,
    private readonly interviews: InterviewSyncStore,
    private readonly jds: JdReader,
    private readonly resumes: ResumePublicationGateway,
    private readonly experiences: ExperienceReader,
    private readonly reminderProposals: ReminderProposalService,
  ) {}

  public async applicationContext(applicationId: string) {
    const task = await this.#runningTask();
    this.#requireAction(task.grant.allowedActions, "application.loop.read");
    this.#requireApplicationPolicy(task.grant.assetPolicy, applicationId);
    const application = await this.applications.getApplication(applicationId);
    const [jd, resume] = await Promise.all([
      application.jdId ? this.jds.getJd(application.jdId) : null,
      application.resumeId ? this.resumes.getResume(application.resumeId) : null,
    ]);
    const interviewId = task.grant.connectorPolicy?.interviewId;
    const interview = typeof interviewId === "string"
      ? await this.interviews.get(interviewId) : null;
    if (interview && interview.applicationId !== application.id) {
      throw new Error("Loop Interview 不属于冻结的 Application");
    }
    const now = new Date();
    const checkIntervalHours = numberPolicy(
      task.grant.connectorPolicy?.checkIntervalHours, 24,
    );
    return {
      now: now.toISOString(),
      application,
      jd: jd ? { id: jd.id, title: jd.title, company: jd.company,
        targetRole: jd.targetRole, requirements: jd.requirements } : null,
      resume: resume ? { id: resume.id, title: resume.title,
        targetRole: resume.targetRole, contentHash: resume.contentHash } : null,
      interview: interview ? {
        id: interview.id, roundNumber: interview.roundNumber,
        scheduledAt: interview.scheduledAt, timezone: interview.timezone,
        status: interview.status,
      } : null,
      loopPolicy: {
        kind: task.grant.jobCriteria.loopKind,
        checkIntervalHours,
        nextCheckAt: new Date(
          now.getTime() + checkIntervalHours * 3_600_000,
        ).toISOString(),
      },
    };
  }

  public async createFollowUp(input: {
    applicationId: string; subject: string; body: string;
    scheduledFor: string; timezone: string;
  }) {
    const context = await this.applicationContext(input.applicationId);
    if (["offer", "rejected"].includes(context.application.status)) {
      throw new Error("终态 Application 不创建跟进邮件");
    }
    const task = await this.#runningTask();
    this.#requireAction(task.grant.allowedActions, "follow_up.write");
    const schedule = normalizeFollowUpSchedule(input.scheduledFor, input.timezone);
    const checkIntervalHours = numberPolicy(
      task.grant.connectorPolicy?.checkIntervalHours, 24,
    );
    assertFollowUpSpacing(
      await this.harness.aiNativeArtifacts.list(task.task.id),
      input.applicationId, schedule.scheduledFor, checkIntervalHours,
    );
    return this.harness.aiNativeArtifacts.create({
      kind: "follow_up_draft", taskId: task.task.id,
      dedupeKey: `follow-up:${input.applicationId}:${schedule.scheduledFor}`,
      applicationId: input.applicationId, subject: input.subject.trim(),
      body: input.body.trim(), ...schedule,
    });
  }

  public async createBrief(input: {
    applicationId: string; interviewId: string; title: string;
    sections: Array<{ heading: string; content: string; sourceRefs: string[] }>;
  }) {
    const context = await this.applicationContext(input.applicationId);
    const interview = await this.interviews.get(input.interviewId);
    if (interview.applicationId !== context.application.id ||
        interview.status !== "scheduled") {
      throw new Error("面试简报必须绑定当前 Application 的 scheduled Interview");
    }
    const task = await this.#runningTask();
    this.#requireAction(task.grant.allowedActions, "briefing.write");
    await validateBriefSourceRefs(
      context.application, input.sections, task.grant, this.experiences,
    );
    return this.harness.aiNativeArtifacts.create({
      kind: "interview_brief", taskId: task.task.id,
      dedupeKey: `brief:${input.interviewId}:${interview.entityVersion}`,
      applicationId: input.applicationId, interviewId: input.interviewId,
      title: input.title.trim(),
      sections: input.sections.map((section) => ({
        heading: section.heading.trim(), content: section.content.trim(),
        sourceRefs: [...new Set(section.sourceRefs)],
      })),
    });
  }

  public async strategyMetrics() {
    const task = await this.#runningTask();
    this.#requireAction(task.grant.allowedActions, "strategy.read");
    if (task.grant.jobCriteria.loopKind !== "application_strategy") {
      throw new Error("当前任务不是 Strategy Learner");
    }
    const applications = await allApplications(this.applications);
    const snapshot = buildApplicationStrategySnapshot(applications);
    const reviewIntervalDays = numberPolicy(
      task.grant.connectorPolicy?.reviewIntervalDays, 7,
    );
    return {
      ...snapshot,
      snapshotHash: canonicalHash(snapshot as unknown as JsonValue),
      nextReviewAt: new Date(
        Date.now() + reviewIntervalDays * 86_400_000,
      ).toISOString(),
    };
  }

  public async createStrategy(input: {
    snapshotHash: string; title: string; summary: string; recommendations: string[];
  }) {
    const metrics = await this.strategyMetrics();
    if (metrics.snapshotHash !== input.snapshotHash) throw new Error("投递指标已变化，请重新读取");
    if (metrics.total < 5) throw new Error("至少需要 5 条 Application 才能形成个人策略建议");
    const task = await this.#runningTask();
    this.#requireAction(task.grant.allowedActions, "strategy.write");
    return this.harness.aiNativeArtifacts.create({
      kind: "strategy_proposal", taskId: task.task.id,
      dedupeKey: `strategy:${metrics.snapshotHash}`, snapshotHash: metrics.snapshotHash,
      title: input.title.trim(), summary: input.summary.trim(),
      recommendations: [...new Set(input.recommendations.map((item) => item.trim()))]
        .filter(Boolean).slice(0, 5),
      caveat: "这是基于个人历史的相关性观察，不代表因果关系。",
    });
  }

  public async createRiskNotice(input: {
    signalId: string; severity: "review" | "high"; title: string;
    rationale: string; deadlineAt?: string | null;
  }) {
    const task = await this.#runningTask();
    this.#requireAction(task.grant.allowedActions, "risk.write");
    if (task.grant.jobCriteria.loopKind !== "risk_deadline_watch") {
      throw new Error("当前任务不是风险与截止监控 Loop");
    }
    const signal = await this.harness.signals.get(task.task.id, input.signalId);
    assertMailDirectionAllowed(task.grant.connectorPolicy, signal.direction);
    if (!signal.evidenceQuotes.length) throw new Error("风险或截止提示缺少邮件原文证据");
    if (!signal.securityFlags.length &&
        !["deadline", "portal_action", "risk_signal"].includes(signal.kind)) {
      throw new Error("当前邮件信号没有可追溯的风险或截止依据");
    }
    return this.harness.aiNativeArtifacts.create({
      kind: "risk_notice", taskId: task.task.id,
      dedupeKey: `risk:${signal.id}:${signal.contentHash}`,
      applicationId: signal.applicationId, severity: input.severity,
      title: input.title.trim(), rationale: input.rationale.trim(),
      evidenceQuotes: signal.evidenceQuotes,
      deadlineAt: input.deadlineAt ? new Date(input.deadlineAt).toISOString() : null,
    });
  }

  public async prepareReminder(input: {
    signalId?: string;
    applicationId: string; interviewId?: string | null;
    title: string; remindAt: string;
  }) {
    const task = await this.#runningTask();
    if (!task.grant.allowedActions.includes("reminder.prepare")) {
      throw new Error("当前 Loop 未授权准备 Reminder");
    }
    if (task.grant.assetPolicy.applicationId !== input.applicationId) {
      if (task.grant.assetPolicy.applicationScope !== "mail_linked" || !input.signalId) {
        throw new Error("Application 不在当前 Reminder Loop 范围");
      }
      const signal = await this.harness.signals.get(task.task.id, input.signalId);
      if (signal.applicationId !== input.applicationId) {
        throw new Error("Reminder Application 与邮件信号不匹配");
      }
    }
    await this.applications.getApplication(input.applicationId);
    return this.reminderProposals.prepareCreate(input.applicationId, {
      interviewRoundId: input.interviewId ?? null,
      title: input.title.trim(), remindAt: new Date(input.remindAt).toISOString(),
      status: "scheduled", deliveredAt: null,
    });
  }

  public executeReminder(proposalId: string) {
    return this.reminderProposals.execute(proposalId);
  }

  async #runningTask() {
    const task = await this.harness.tasks.findRunningByConversation(this.conversationId);
    if (!task?.activeRunId) throw new Error("AI Native 产物需要 running AgentTask");
    const active = await this.harness.grants.getActive(task.id);
    if (!active.grant || active.revocation) throw new Error("AI Native Loop grant 不可用");
    return { task, grant: active.grant };
  }

  #requireApplicationPolicy(policy: Record<string, JsonValue>, applicationId: string): void {
    if (policy.applicationId !== applicationId) {
      throw new Error("Application 不在当前 Loop 的冻结范围");
    }
  }

  #requireAction(actions: string[], action: string): void {
    if (!actions.includes(action)) throw new Error(`当前 Loop 未授权 ${action}`);
  }

}

function numberPolicy(value: JsonValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function allApplications(store: ApplicationSyncStore): Promise<ApplicationRecord[]> {
  const values: ApplicationRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.listApplications({ limit: 100, ...(cursor ? { cursor } : {}) });
    values.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return values;
}
