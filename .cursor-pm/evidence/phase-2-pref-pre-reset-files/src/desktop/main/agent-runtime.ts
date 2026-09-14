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
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import type { AgentPromptInput, ConversationDetail } from "../shared/types.js";
import { AgentContextFactory } from "./agent-context-factory.js";
import { AgentRuntimeContextStore } from "./agent-runtime-context-loader.js";
import { resolveAgentApproval } from "./agent-runtime-approval.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import { executeAgentPrompt } from "./agent-runtime-prompt.js";
import { compactBeforeAgentPrompt } from "./agent-runtime-compaction.js";
import type { SyncNowResult } from "../../tools/sync-now.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import { ConversationStore } from "./conversation-store.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import { readConfig } from "../../config.js";
import { ResumeGenerationTraceStore } from "../../resume/performance/generation-trace-store.js";
import { createRunTerminalForContext } from "./agent-runtime-terminal.js";
import type { ProfileProposalExecutor } from "../../profile/types.js";
import type { ExperienceProposalService } from "./experience-library/experience-proposal-service.js";
import { ConversationRunGate } from "./conversation-run-gate.js";
import { LocalExperienceMaterialCommitter } from "./experience-library/experience-material-committer.js";
import type { ManagedResumeUploadService } from "./agent-task/managed-resume-upload-service.js";
import type { PreferenceProposalService } from "./preference/preference-proposal-service.js";
import type { PreferenceSuggestionStore } from "./agent-task/preference-suggestion-store.js";
import type { PreferenceReaderV1 } from "../../preference/types.js";
export class DesktopAgentRuntime {
  readonly #store: ConversationStore; readonly #resumeDrafts: ResumeDraftService;
  readonly #events: AgentRuntimeEvents;
  readonly #traces = new ResumeGenerationTraceStore();
  readonly #contexts: AgentRuntimeContextStore;
  readonly #runGate = new ConversationRunGate();
  #cancelRequested = false;
  #persistChain: Promise<void> = Promise.resolve();
  readonly #selectedFiles: ConversationSelectedFiles;
  public constructor(
    apiClient: CooltoApiClient, ownerId: string, store: ConversationStore,
    resumeDrafts: ResumeDraftService, target: WebContents,
    resumeCompiler: ResumePdfCompiler, selectedFiles: ConversationSelectedFiles,
    browserAgentController: BrowserAgentController,
    browserPageOperator: BrowserPageOperator, agentHarness: AgentHarnessServices,
    agentTaskProposals: AgentTaskProposalService, resumePublications: ResumePublicationGateway,
    applications: ApplicationSyncStore, applicationProposals: ApplicationProposalService,
    deliveryResumeFiles: import("../../delivery-resume-files/types.js").DeliveryResumeFileStore,
    managedResumeUploads: ManagedResumeUploadService, mailConnections: MailConnectionRegistry,
    interviews: InterviewSyncStore, interviewProposals: InterviewProposalService, reminderProposals: import("./tracker/reminder-proposal-service.js").ReminderProposalService,
    experiences: ExperienceReader & ExperienceWriter,
    jds: JdReader & JdWriter, profiles: UserProfileReader,
    profileProposals: ProfileProposalExecutor,
    preferences: PreferenceReaderV1,
    preferenceProposals: PreferenceProposalService,
    preferenceSuggestions: PreferenceSuggestionStore,
    experienceProposals: ExperienceProposalService,
    private readonly compactionThreshold: () => Promise<number | undefined>,
    private readonly syncNow: () => Promise<SyncNowResult>,
    private readonly requireCloudBusinessAccess: () => void,
  ) {
    // Keep the pre-Profile/PREF positional constructor usable for focused
    // runtime tests and embedders while the production path passes ownerId.
    // The production create-user-services call always takes the new branch.
    const legacyStore = store === undefined &&
      typeof ownerId === "object" && ownerId !== null
      ? ownerId as unknown as ConversationStore
      : undefined;
    const actualStore = (legacyStore ?? store) as ConversationStore;
    const actualResumeDrafts = (legacyStore
      ? store
      : resumeDrafts) as unknown as ResumeDraftService;
    const actualOwnerId = legacyStore ? "legacy-runtime" : ownerId;
    this.#store = actualStore;
    this.#resumeDrafts = actualResumeDrafts;
    this.#selectedFiles = selectedFiles;
    this.#events = new AgentRuntimeEvents(target, actualStore, actualResumeDrafts, this.#traces,
      new LocalExperienceMaterialCommitter(experiences, experienceProposals));
    const contextFactory = new AgentContextFactory({
      ownerId: actualOwnerId,
      apiClient,
      resumeCompiler,
      selectedFiles,
      browserAgentController, browserPageOperator, agentHarness,
      agentTaskProposals, applications, applicationProposals, mailConnections,
      deliveryResumeFiles, managedResumeUploads, interviews, interviewProposals, reminderProposals,
      resumePublications,
      experiences,
      jds,
      profiles,
      profileProposals,
      preferences,
      preferenceProposals,
      preferenceSuggestions,
      experienceProposals, resumeDrafts: actualResumeDrafts, events: this.#events,
      traces: this.#traces,
      syncNow: this.syncNow,
    });
    this.#contexts = new AgentRuntimeContextStore({
      contextFactory,
      store: actualStore,
      resumeDrafts: actualResumeDrafts,
      requireCloudBusinessAccess: this.requireCloudBusinessAccess,
    });
  }
  public get isRunning(): boolean { return this.#runGate.isRunning; }
  public async pendingApprovals(conversationId: string) {
    return (await this.#contextFor(conversationId)).agent.getPendingApprovals();
  }
  public async prompt(input: AgentPromptInput): Promise<ConversationDetail> {
    const conversationId = input.conversationId;
    if (!this.#runGate.isAccepting) throw new Error("运行时正在退出，请稍候再试");
    const context = await this.#contextFor(conversationId);
    // Ordinary prompts always start from host-safe discovery.  A managed task
    // may narrow/expand within its capability grant in the context factory;
    // renderer input has no authority to choose a domain.
    await context.scopeTools();
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
      await context.refreshProfilePreferenceContext?.();
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
      return await this.#enqueuePersist(() => this.#store.saveMessages(conversationId, result.messages, pendingAttachments, result.attachTimestamp, assistantCompletedAt, createRunTerminalForContext(context, this.#cancelRequested)));
    } catch (error) {
      failed = true;
      await this.#enqueuePersist(() => this.#store.saveRunTerminal(conversationId, createRunTerminalForContext(context, this.#cancelRequested, error))).catch(() => undefined);
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
  public async quiesce(): Promise<void> {
    this.#runGate.quiesce();
    this.cancel();
    await this.#runGate.waitForIdle();
    await this.flushPending();
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
  public resolveApproval(
    conversationId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<ConversationDetail> {
    return resolveAgentApproval({
      conversationId,
      requestId,
      decision,
      getContext: (id) => this.#contextFor(id),
      runGate: this.#runGate,
      events: this.#events,
      resumeDrafts: this.#resumeDrafts,
      conversations: this.#store,
      setCancelRequested: (value) => { this.#cancelRequested = value; },
      isCancelRequested: () => this.#cancelRequested,
      enqueuePersist: (task) => this.#enqueuePersist(task),
      persistSnapshot: (id, agent) => this.#persistSnapshot(id, agent),
    });
  }
  async #contextFor(conversationId: string) {
    return this.#contexts.load(conversationId);
  }
}
