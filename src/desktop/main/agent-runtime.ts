import type { WebContents } from "electron";

import { createActionApprovalManager } from "../../actions/create-action-approvals.js";
import { createCooltoAgent } from "../../agent/create-agent.js";
import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import { readConfig } from "../../config.js";
import { SelectedFileRegistry } from "../../files/selected-file-registry.js";
import { ExperienceImportProposalStore } from "../../import/proposal-store.js";
import { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../../resume/workspace/candidate-preparer.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { ResumeQualityEvaluator } from "../../resume/quality/quality-evaluator.js";
import { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import { ResumeAlternativeRepairer } from "../../resume/quality/alternative-repairer.js";
import { createToolRegistry } from "../../tools/registry.js";
import type {
  ConversationDetail,
  DesktopAgentEvent,
} from "../shared/types.js";
import { ConversationStore } from "./conversation-store.js";

export class DesktopAgentRuntime {
  readonly #apiClient: CooltoApiClient;
  readonly #store: ConversationStore;
  readonly #target: WebContents;
  readonly #resumeCompiler: ResumeCompiler;
  readonly #agents = new Map<string, CooltoAgent>();
  #runningConversationId: string | undefined;

  public constructor(
    apiClient: CooltoApiClient,
    store: ConversationStore,
    target: WebContents,
    resumeCompiler: ResumeCompiler,
  ) {
    this.#apiClient = apiClient;
    this.#store = store;
    this.#target = target;
    this.#resumeCompiler = resumeCompiler;
  }

  public get isRunning(): boolean {
    return this.#runningConversationId !== undefined;
  }

  public async prompt(
    conversationId: string,
    text: string,
  ): Promise<ConversationDetail> {
    const agent = await this.#agentFor(conversationId);
    this.#assertCanRun(conversationId);
    this.#runningConversationId = conversationId;
    try {
      await agent.prompt(text);
      return await this.#store.saveMessages(
        conversationId,
        agent.getMessages(),
      );
    } finally {
      this.#runningConversationId = undefined;
    }
  }

  public cancel(): void {
    if (this.#runningConversationId) {
      this.#agents.get(this.#runningConversationId)?.cancel();
    }
  }

  public async resolveApproval(
    conversationId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<ConversationDetail> {
    const agent = await this.#agentFor(conversationId);
    this.#assertCanRun(conversationId);
    this.#runningConversationId = conversationId;
    try {
      await agent.resolveApproval(requestId, decision);
      return await this.#store.saveMessages(
        conversationId,
        agent.getMessages(),
      );
    } finally {
      this.#runningConversationId = undefined;
    }
  }

  async #agentFor(conversationId: string): Promise<CooltoAgent> {
    const existing = this.#agents.get(conversationId);
    if (existing) {
      return existing;
    }
    const agent = this.#createAgent(conversationId);
    agent.replaceMessages(await this.#store.loadMessages(conversationId));
    this.#agents.set(conversationId, agent);
    return agent;
  }

  #assertCanRun(conversationId: string): void {
    if (
      this.#runningConversationId &&
      this.#runningConversationId !== conversationId
    ) {
      throw new Error("另一个对话正在回复，请等待完成或先停止");
    }
  }

  #createAgent(conversationId: string): CooltoAgent {
    const config = readConfig();
    const selectedFiles = new SelectedFileRegistry();
    const proposalStore = new ExperienceImportProposalStore();
    const approvalManager = createActionApprovalManager(
      this.#apiClient,
      proposalStore,
    );
    const resumeSourceSnapshotBuilder = new ResumeSourceSnapshotBuilder({
      currentUser: this.#apiClient,
      profile: this.#apiClient,
      jd: this.#apiClient,
      experience: this.#apiClient,
    });
    const resumeWorkspaceStore = new ResumeWorkspaceStore();
    const resumeCandidatePreparer = new ResumeCandidatePreparer(
      resumeSourceSnapshotBuilder,
      this.#resumeCompiler,
      resumeWorkspaceStore,
    );
    const resumeCandidatePatcher = new ResumeCandidatePatcher(
      this.#resumeCompiler,
      resumeWorkspaceStore,
    );
    const resumeQualityEvaluator = new ResumeQualityEvaluator();
    const resumeCandidateReviewer = new ResumeCandidateReviewer(
      resumeQualityEvaluator,
      resumeWorkspaceStore,
    );
    const resumeAlternativeRepairer = new ResumeAlternativeRepairer(
      this.#resumeCompiler,
      resumeQualityEvaluator,
      resumeWorkspaceStore,
    );
    const agent = createCooltoAgent({
      apiKey: config.apiKey,
      modelId: config.modelId,
      approvalManager,
      tools: createToolRegistry({
        currentUserReader: this.#apiClient,
        userProfileReader: this.#apiClient,
        experienceReader: this.#apiClient,
        jdReader: this.#apiClient,
        resumeSourceSnapshotBuilder,
        resumeCandidatePreparer,
        resumeCandidatePatcher,
        resumeCandidateReviewer,
        resumeAlternativeRepairer,
        importProposalStore: proposalStore,
        approvalManager,
        selectedFileRegistry: selectedFiles,
      }),
    });
    agent.subscribe((event) => {
      if (this.#target.isDestroyed()) {
        return;
      }
      this.#target.send("agent:event", {
        conversationId,
        event: event as DesktopAgentEvent,
      });
    });
    return agent;
  }
}
