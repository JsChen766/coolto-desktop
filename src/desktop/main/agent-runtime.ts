import type { WebContents } from "electron";

import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ExperienceReader, ExperienceWriter, JdReader, JdWriter } from "../../api/types.js";
import type { ApprovalDecision } from "../../approvals/types.js";
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
import { promptWithResumeReference } from "./agent-prompt-reference.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import { ConversationStore } from "./conversation-store.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";

export class DesktopAgentRuntime {
  readonly #store: ConversationStore;
  readonly #resumeDrafts: ResumeDraftService;
  readonly #events: AgentRuntimeEvents;
  readonly #contextFactory: AgentContextFactory;
  readonly #contexts = new Map<string, ConversationAgentContext>();
  #runningConversationId: string | undefined;

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
  ) {
    this.#store = store;
    this.#resumeDrafts = resumeDrafts;
    this.#events = new AgentRuntimeEvents(target, store, resumeDrafts);
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
      events: this.#events,
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
    try {
      const editBase =
        input.resumeReference &&
        input.resumeReference.source !== "cloud"
        ? await this.#activateReferencedDraft(
            context,
            input.resumeReference.artifactId,
          )
        : undefined;
      if (editBase) {
        context.activeEdit = {
          artifactId: editBase.artifactId,
          base: structuredClone(editBase.workspace),
          summary: `AI 修改：${input.resumeReference?.label ?? "简历内容"}`,
        };
      }
      await context.agent.prompt(
        input.resumeReference
          ? promptWithResumeReference(input.text, input.resumeReference)
          : input.text,
      );
      const proposed = context.workspaceStore.latest();
      if (editBase && proposed && proposed.revision !== editBase.workspace.revision) {
        await this.#resumeDrafts.proposeChange({
          artifactId: editBase.artifactId,
          base: editBase.workspace,
          proposed,
          summary: context.activeEdit?.summary ?? "AI 修改简历内容",
        });
      }
      return await this.#store.saveMessages(
        conversationId,
        context.agent.getMessages(),
      );
    } finally {
      context.activeEdit = undefined;
      this.#runningConversationId = undefined;
    }
  }

  public cancel(): void {
    if (this.#runningConversationId) {
      this.#contexts.get(this.#runningConversationId)?.agent.cancel();
    }
  }

  public async resolveApproval(
    conversationId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<ConversationDetail> {
    const context = await this.#contextFor(conversationId);
    this.#assertCanRun(conversationId);
    this.#runningConversationId = conversationId;
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
      if (savedJd) {
        this.#events.emitJdSaved(conversationId, requestId, savedJd.jdId);
        await context.agent.prompt(buildJdContinuationPrompt(savedJd));
      }
      const grantedReason = writeAccessContinuation?.getGrantedReason();
      if (grantedReason) {
        await context.agent.prompt(
          buildBrowserWriteAccessContinuationPrompt(grantedReason),
        );
      }
      return await this.#store.saveMessages(
        conversationId,
        context.agent.getMessages(),
      );
    } finally {
      this.#runningConversationId = undefined;
    }
  }

  async #activateReferencedDraft(
    context: ConversationAgentContext,
    artifactId: string,
  ) {
    const draft = await this.#resumeDrafts.get(artifactId);
    context.workspaceStore.restore(draft.workspace);
    context.artifactIdByCandidate.set(
      draft.workspace.candidateId,
      draft.artifactId,
    );
    return draft;
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
