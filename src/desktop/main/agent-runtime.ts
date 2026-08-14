import type { WebContents } from "electron";
import { performance } from "node:perf_hooks";

import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ExperienceReader, ExperienceWriter, JdReader, JdWriter, UserProfileReader } from "../../api/types.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { BrowserPageOperator, BrowserPageReader } from "../../browser/types.js";
import {
  buildBrowserWriteAccessContinuationPrompt,
  prepareBrowserWriteAccessContinuation,
} from "./browser-write-access-continuation.js";
import {
  buildJdContinuationPrompt,
  prepareJdContinuation,
} from "./jd-continuation.js";
import type { ResumePdfCompiler, ResumePdfExportGateway } from "../../resume/export/types.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import type { AgentPromptInput, ConversationDetail } from "../shared/types.js";
import { AgentContextFactory } from "./agent-context-factory.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import { executeAgentPrompt } from "./agent-runtime-prompt.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import { ConversationStore } from "./conversation-store.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import { readConfig } from "../../config.js";
import { ResumeGenerationTraceStore } from "../../resume/performance/generation-trace-store.js";
import type { ProfileProposalExecutor } from "../../profile/types.js";

export class DesktopAgentRuntime {
  readonly #store: ConversationStore;
  readonly #resumeDrafts: ResumeDraftService;
  readonly #events: AgentRuntimeEvents;
  readonly #contextFactory: AgentContextFactory;
  readonly #traces = new ResumeGenerationTraceStore();
  readonly #contexts = new Map<string, ConversationAgentContext>();
  #runningConversationId: string | undefined;
  /** Set by the stop button; checked before every continuation round and
   * before follow-up prompts. Aborting alone is not enough: the agent loop
   * settles silently after an abort and would be re-prompted immediately. */
  #cancelRequested = false;
  /** Serializes background transcript snapshots so concurrent writes to the
   * same conversation file never interleave. */
  #persistChain: Promise<void> = Promise.resolve();

  public constructor(
    apiClient: CooltoApiClient,
    store: ConversationStore,
    resumeDrafts: ResumeDraftService,
    target: WebContents,
    resumeCompiler: ResumePdfCompiler,
    resumePdfExports: ResumePdfExportGateway,
    selectedFiles: ConversationSelectedFiles,
    browserPageReader: BrowserPageReader,
    browserPageOperator: BrowserPageOperator,
    resumePublications: ResumePublicationGateway,
    experiences: ExperienceReader & ExperienceWriter,
    jds: JdReader & JdWriter,
    profiles: UserProfileReader,
    profileProposals: ProfileProposalExecutor,
  ) {
    this.#store = store;
    this.#resumeDrafts = resumeDrafts;
    this.#events = new AgentRuntimeEvents(target, store, resumeDrafts, this.#traces);
    this.#contextFactory = new AgentContextFactory({
      apiClient,
      resumeCompiler,
      resumePdfExports,
      selectedFiles,
      browserPageReader,
      browserPageOperator,
      resumePublications,
      experiences,
      jds,
      profiles,
      profileProposals,
      events: this.#events,
      traces: this.#traces,
    });
  }

  public get isRunning(): boolean {
    return this.#runningConversationId !== undefined;
  }

  public async prompt(input: AgentPromptInput): Promise<ConversationDetail> {
    const conversationId = input.conversationId;
    const context = await this.#contextFor(conversationId);
    this.#assertCanRun(conversationId);
    this.#runningConversationId = conversationId;
    this.#cancelRequested = false;
    this.#traces.start(conversationId, readConfig().modelId);
    const commandStartedAt = performance.now();
    let failed = false;
    // Snapshot the transcript after every completed turn so an abrupt close
    // or a hard failure never loses more than the in-flight turn.
    const unsubscribePersist = context.agent.subscribe((event) => {
      if (event.type === "turn.completed") {
        void this.#persistSnapshot(conversationId, context.agent).catch(
          () => {},
        );
      }
    });
    try {
      return await executeAgentPrompt({
        prompt: input,
        context,
        store: this.#store,
        resumeDrafts: this.#resumeDrafts,
        events: this.#events,
        commandStartedAt,
        isCancelled: () => this.#cancelRequested,
      });
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      unsubscribePersist();
      if (failed) {
        // Persist whatever the transcript holds (user message, completed
        // turns) so an interrupted or failed run keeps its history.
        await this.#persistSnapshot(conversationId, context.agent).catch(
          () => {},
        );
      }
      this.#traces.finish(conversationId, {
        workspaceStatus: context.workspaceStore.latest()?.status ?? null,
        failed,
      });
      context.activeEdit = undefined;
      this.#runningConversationId = undefined;
    }
  }

  public cancel(): void {
    this.#cancelRequested = true;
    if (this.#runningConversationId) {
      this.#contexts.get(this.#runningConversationId)?.agent.cancel();
    }
  }

  /** Persists the in-flight transcript snapshot before the app quits. */
  public async flushPending(): Promise<void> {
    const conversationId = this.#runningConversationId;
    if (!conversationId) return;
    const context = this.#contexts.get(conversationId);
    if (!context) return;
    await this.#persistSnapshot(conversationId, context.agent);
  }

  /** Queued, best-effort snapshot of the agent transcript to the store. */
  #persistSnapshot(conversationId: string, agent: CooltoAgent): Promise<void> {
    const next = this.#persistChain.then(async () => {
      await this.#store.saveMessages(conversationId, agent.getMessages());
    });
    this.#persistChain = next.catch(() => {});
    return next;
  }

  public generationTrace(conversationId: string) {
    return this.#traces.latestForConversation(conversationId);
  }

  public async resolveApproval(
    conversationId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<ConversationDetail> {
    const context = await this.#contextFor(conversationId);
    this.#assertCanRun(conversationId);
    this.#runningConversationId = conversationId;
    this.#cancelRequested = false;
    let failed = false;
    try {
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
      await context.agent.resolveApproval(requestId, decision);
      const savedJd = jdContinuation?.getSavedJd();
      if (savedJd && !this.#cancelRequested) {
        this.#events.emitJdSaved(conversationId, requestId, savedJd.jdId);
        await context.agent.prompt(buildJdContinuationPrompt(savedJd));
      }
      const grantedReason = writeAccessContinuation?.getGrantedReason();
      if (grantedReason && !this.#cancelRequested) {
        await context.agent.prompt(
          buildBrowserWriteAccessContinuationPrompt(grantedReason),
        );
      }
      return await this.#store.saveMessages(
        conversationId,
        context.agent.getMessages(),
      );
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (failed) {
        await this.#persistSnapshot(conversationId, context.agent).catch(
          () => {},
        );
      }
      this.#runningConversationId = undefined;
    }
  }

  async #contextFor(conversationId: string): Promise<ConversationAgentContext> {
    const existing = this.#contexts.get(conversationId);
    if (existing) return existing;
    const context = this.#contextFactory.create(conversationId);
    context.agent.replaceMessages(await this.#store.loadMessages(conversationId));
    this.#contexts.set(conversationId, context);
    return context;
  }

  #assertCanRun(conversationId: string): void {
    if (
      this.#runningConversationId &&
      this.#runningConversationId !== conversationId
    ) {
      throw new Error("另一个对话正在回复，请等待完成或先停止");
    }
  }
}
