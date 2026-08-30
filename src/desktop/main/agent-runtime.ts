import type { WebContents } from "electron";
import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ExperienceReader, ExperienceWriter, JdReader, JdWriter, UserProfileReader } from "../../api/types.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { BrowserAgentController } from "../../browser/agent-control-types.js";
import type { BrowserPageOperator } from "../../browser/types.js";
import type { AgentHarnessServices } from "../../agent-task/agent-harness-services.js";
import type { AgentTaskProposalService } from "./agent-task/agent-task-proposal-service.js";
import type { ApplicationProposalService } from "./application-library/application-proposal-service.js";
import type { ApplicationSyncStore } from "./application-library/application-sync-store.js";
import type { MailConnectionRegistry } from "../../inbox-signals/inbox-signal-types.js";
import type { InterviewSyncStore } from "./tracker/interview-sync-store.js";
import type { InterviewProposalService } from "./tracker/interview-proposal-service.js";
import { buildBrowserWriteAccessContinuationPrompt, prepareBrowserWriteAccessContinuation } from "./browser-write-access-continuation.js";
import { announceResumeGenerationStart, buildJdContinuationPrompt, prepareJdContinuation } from "./jd-continuation.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import type { AgentPromptInput, ConversationDetail } from "../shared/types.js";
import { AgentContextFactory } from "./agent-context-factory.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import { executeAgentPrompt, runContinuationPrompt } from "./agent-runtime-prompt.js";
import { compactBeforeAgentPrompt } from "./agent-runtime-compaction.js";
import type { SyncNowResult } from "../../tools/sync-now.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import { ConversationStore } from "./conversation-store.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import { readConfig } from "../../config.js";
import { ResumeGenerationTraceStore } from "../../resume/performance/generation-trace-store.js";
import type { ProfileProposalExecutor } from "../../profile/types.js";
import type { ResumeExperienceSyncProposalPort } from "../../resume/material/experience-sync-port.js";
import { continueAfterResumeAugmentation } from "./resume-augmentation-resolution.js";
import { restoreLatestInProgressResume } from "./resume-drafts/resume-conversation-restorer.js";
import { ConversationRunGate } from "./conversation-run-gate.js";
import { continueAfterResumeStrategyChoice, pendingResumeStrategyChoice } from "./resume-strategy-continuation.js";
import { activateBestAvailableGeneralResume } from "./resume-strategy-general-selection.js";
export class DesktopAgentRuntime {
  readonly #store: ConversationStore;
  readonly #resumeDrafts: ResumeDraftService;
  readonly #events: AgentRuntimeEvents;
  readonly #contextFactory: AgentContextFactory;
  readonly #traces = new ResumeGenerationTraceStore();
  readonly #contexts = new Map<string, ConversationAgentContext>();
  readonly #runGate = new ConversationRunGate();
  #cancelRequested = false;
  #persistChain: Promise<void> = Promise.resolve();
  readonly #selectedFiles: ConversationSelectedFiles;
  public constructor(
    apiClient: CooltoApiClient, store: ConversationStore,
    resumeDrafts: ResumeDraftService, target: WebContents,
    resumeCompiler: ResumePdfCompiler, selectedFiles: ConversationSelectedFiles,
    browserAgentController: BrowserAgentController,
    browserPageOperator: BrowserPageOperator, agentHarness: AgentHarnessServices,
    agentTaskProposals: AgentTaskProposalService, resumePublications: ResumePublicationGateway,
    applications: ApplicationSyncStore, applicationProposals: ApplicationProposalService,
    deliveryResumeFiles: import("../../delivery-resume-files/types.js").DeliveryResumeFileStore,
    mailConnections: MailConnectionRegistry, interviews: InterviewSyncStore,
    interviewProposals: InterviewProposalService, experiences: ExperienceReader & ExperienceWriter,
    jds: JdReader & JdWriter, profiles: UserProfileReader,
    profileProposals: ProfileProposalExecutor,
    experienceSyncProposals: ResumeExperienceSyncProposalPort,
    private readonly compactionThreshold: () => Promise<number | undefined>,
    private readonly syncNow: () => Promise<SyncNowResult>,
  ) {
    this.#store = store;
    this.#resumeDrafts = resumeDrafts;
    this.#selectedFiles = selectedFiles;
    this.#events = new AgentRuntimeEvents(target, store, resumeDrafts, this.#traces);
    this.#contextFactory = new AgentContextFactory({
      apiClient,
      resumeCompiler,
      selectedFiles,
      browserAgentController, browserPageOperator, agentHarness,
      agentTaskProposals, applications, applicationProposals, mailConnections,
      deliveryResumeFiles, interviews, interviewProposals,
      resumePublications,
      experiences,
      jds,
      profiles,
      profileProposals,
      experienceSyncProposals, resumeDrafts,
      events: this.#events,
      traces: this.#traces,
      syncNow: this.syncNow,
    });
  }
  public get isRunning(): boolean { return this.#runGate.isRunning; }
  public async prompt(input: AgentPromptInput): Promise<ConversationDetail> {
    const conversationId = input.conversationId;
    const context = await this.#contextFor(conversationId);
    if (context.agent.isRunning) {
      throw new Error("正在处理上一条消息，请稍候再试");
    }
    this.#runGate.begin(conversationId);
    this.#cancelRequested = false;
    const pendingAttachments = this.#selectedFiles.list(conversationId)
      .map((f) => ({ ...f, fileId: f.id, status: "pending" as const }));
    this.#traces.start(conversationId, readConfig().modelId);
    let failed = false;
    let unsubscribePersist = () => {};
    try {
      await compactBeforeAgentPrompt(context, this.compactionThreshold);
      unsubscribePersist = context.agent.subscribe((event) => {
        if (event.type === "turn.completed") {
          void this.#persistSnapshot(conversationId, context.agent).catch(() => {});
        }
      });
      const result = await executeAgentPrompt({
        prompt: input,
        context,
        resumeDrafts: this.#resumeDrafts,
        pendingAttachments,
      });
      const lastAssistant = [...result.messages].reverse().find((m) => m.role === "assistant");
      const assistantCompletedAt = lastAssistant ? { timestamp: lastAssistant.timestamp, completedAt: new Date().toISOString() } : undefined;
      return await this.#enqueuePersist(() => this.#store.saveMessages(conversationId, result.messages, pendingAttachments, result.attachTimestamp, assistantCompletedAt));
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      unsubscribePersist();
      if (failed) {
        await this.#persistSnapshot(conversationId, context.agent).catch(() => {});
      }
      this.#traces.finish(conversationId, {
        workspaceStatus: context.workspaceStore.latest()?.status ?? null,
        failed,
      });
      delete context.activeEdit;
      this.#runGate.finish(conversationId);
    }
  }
  public cancel(): void {
    this.#cancelRequested = true;
    const id = this.#runGate.currentConversationId;
    if (id) { this.#traces.recordStopReason(id, "cancelled"); this.#contexts.get(id)?.agent.cancel(); }
  }
  /** Persists the in-flight transcript snapshot before the app quits. */
  public async flushPending(): Promise<void> {
    const conversationId = this.#runGate.currentConversationId;
    if (!conversationId) return;
    const context = this.#contexts.get(conversationId);
    if (!context) return;
    await this.#persistSnapshot(conversationId, context.agent);
  }

  /** 串行化持久化任务，避免并发写同一会话文件；单任务失败不阻塞后续。 */
  #enqueuePersist<T>(task: () => Promise<T>): Promise<T> {
    const next = this.#persistChain.then(task);
    this.#persistChain = next.then(() => undefined, () => undefined);
    return next;
  }

  /** 只存 transcript 的快照：附件绑定只发生在 prompt() 的最终保存。 */
  #persistSnapshot(conversationId: string, agent: CooltoAgent): Promise<void> {
    return this.#enqueuePersist(() =>
      this.#store.saveMessages(conversationId, agent.getMessages()),
    ).then(() => undefined);
  }

  public generationTrace(conversationId: string) { return this.#traces.latestForConversation(conversationId); }

  public async resolveApproval(
    conversationId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<ConversationDetail> {
    const context = await this.#contextFor(conversationId);
    await this.#runGate.beginAfterCurrent(conversationId);
    this.#cancelRequested = false;
    let failed = false;
    try {
      const approval = context.agent
        .getPendingApprovals()
        .find((request) => request.id === requestId);
      const jdContinuation = prepareJdContinuation(
        context.agent,
        requestId,
        decision,
      );
      const writeAccessContinuation = prepareBrowserWriteAccessContinuation(
        context.agent,
        requestId,
        decision,
      );
      const resumeStrategyChoice = pendingResumeStrategyChoice(context.agent, requestId, decision);
      if (decision.type === "custom") {
        context.currentUserMessage.timestamp = Date.now();
        context.currentUserMessage.text = decision.text;
      }
      await context.agent.resolveApproval(requestId, decision);
      await continueAfterResumeAugmentation({
        ...(approval?.actionType ? { actionType: approval.actionType } : {}),
        decision,
        cancelled: this.#cancelRequested,
        ...(context.workspaceStore.latest()?.candidateId
          ? { candidateId: context.workspaceStore.latest()!.candidateId }
          : {}),
        agent: context.agent,
        syncWorkspace: () => this.#events.syncLatestWorkspace(conversationId, context),
      });
      const savedJd = jdContinuation?.getSavedJd();
      if (savedJd && !this.#cancelRequested) {
        this.#events.emitJdSaved(conversationId, requestId, savedJd.jdId);
        if (savedJd.resumeRequested) {
          announceResumeGenerationStart(context.agent, this.#events, conversationId);
        }
        await runContinuationPrompt(
          () => context.agent.prompt(buildJdContinuationPrompt(savedJd)),
        );
      }
      const grantedReason = writeAccessContinuation?.getGrantedReason();
      if (grantedReason && !this.#cancelRequested) {
        await runContinuationPrompt(() =>
          context.agent.prompt(
            buildBrowserWriteAccessContinuationPrompt(grantedReason),
          ),
        );
      }
      await continueAfterResumeStrategyChoice({ choice: resumeStrategyChoice,
        cancelled: this.#cancelRequested, agent: context.agent,
        events: this.#events, conversationId,
        useGeneralResume: () => activateBestAvailableGeneralResume({
          conversationId, drafts: this.#resumeDrafts, conversations: this.#store,
          context, events: this.#events,
        }) });
      return await this.#enqueuePersist(() =>
        this.#store.saveMessages(conversationId, context.agent.getMessages()),
      );
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (failed) await this.#persistSnapshot(conversationId, context.agent).catch(() => {});
      this.#runGate.finish(conversationId);
    }
  }
  async #contextFor(conversationId: string): Promise<ConversationAgentContext> {
    const existing = this.#contexts.get(conversationId);
    if (existing) return existing;
    const context = this.#contextFactory.create(conversationId);
    const [messages, detail] = await Promise.all([this.#store.loadMessages(conversationId), this.#store.get(conversationId)]);
    context.agent.replaceMessages(messages);
    await restoreLatestInProgressResume(detail.resumeArtifacts, this.#resumeDrafts, context).catch(() => false);
    this.#contexts.set(conversationId, context);
    return context;
  }
}
