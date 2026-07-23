import type { WebContents } from "electron";

import { createActionApprovalManager } from "../../actions/create-action-approvals.js";
import { createCooltoAgent } from "../../agent/create-agent.js";
import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import { readConfig } from "../../config.js";
import { SelectedFileRegistry } from "../../files/selected-file-registry.js";
import { ExperienceImportProposalStore } from "../../import/proposal-store.js";
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
  readonly #agents = new Map<string, CooltoAgent>();
  #runningConversationId: string | undefined;

  public constructor(
    apiClient: CooltoApiClient,
    store: ConversationStore,
    target: WebContents,
  ) {
    this.#apiClient = apiClient;
    this.#store = store;
    this.#target = target;
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
    const agent = createCooltoAgent({
      apiKey: config.apiKey,
      modelId: config.modelId,
      approvalManager,
      tools: createToolRegistry({
        currentUserReader: this.#apiClient,
        experienceReader: this.#apiClient,
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
