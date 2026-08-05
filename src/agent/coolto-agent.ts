import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type BeforeToolCallContext,
  type BeforeToolCallResult,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";

import { ApprovalManager } from "../approvals/approval-manager.js";
import type {
  ApprovalDecision,
  ApprovalRequest,
} from "../approvals/types.js";
import {
  type CooltoAgentEvent,
  mapPiEvent,
} from "./events.js";

export interface CooltoAgentOptions {
  model: Model<Api>;
  streamFn: StreamFn;
  systemPrompt: string;
  tools: AgentTool[];
  getApiKey?: (provider: string) => string | undefined;
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>;
  transformContext?: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>;
  approvalManager?: ApprovalManager;
}

export type CooltoAgentListener = (
  event: CooltoAgentEvent,
  signal: AbortSignal,
) => void | Promise<void>;

export class CooltoAgent {
  readonly #agent: Agent;
  readonly #approvalManager: ApprovalManager | undefined;
  #modelCallCount = 0;

  public constructor(options: CooltoAgentOptions) {
    this.#approvalManager = options.approvalManager;
    this.#agent = new Agent({
      initialState: {
        systemPrompt: options.systemPrompt,
        model: options.model,
        tools: options.tools,
        thinkingLevel: "off",
      },
      streamFn: options.streamFn,
      toolExecution: "sequential",
      ...(options.getApiKey ? { getApiKey: options.getApiKey } : {}),
      ...(options.beforeToolCall
        ? { beforeToolCall: options.beforeToolCall }
        : {}),
      ...(options.transformContext
        ? { transformContext: options.transformContext }
        : {}),
    });
    this.#agent.subscribe((event) => {
      if (event.type === "message_start" && event.message.role === "assistant") {
        this.#modelCallCount += 1;
      }
    });
  }

  public get isRunning(): boolean {
    return this.#agent.state.isStreaming;
  }

  /** Total assistant model calls across all prompts since construction. */
  public get modelCallCount(): number {
    return this.#modelCallCount;
  }

  public get toolNames(): string[] {
    return this.#agent.state.tools.map((tool) => tool.name);
  }

  public prompt(input: string): Promise<void> {
    const text = input.trim();
    if (text.length === 0) {
      return Promise.resolve();
    }

    return this.#agent.prompt(text);
  }

  public getMessages(): AgentMessage[] {
    return structuredClone(this.#agent.state.messages);
  }

  public replaceMessages(messages: AgentMessage[]): void {
    if (this.isRunning) {
      throw new Error("Agent 运行期间不能切换对话");
    }
    this.#agent.state.messages = structuredClone(messages);
  }

  public getPendingApprovals(): ApprovalRequest[] {
    return this.#approvalManager?.listPending() ?? [];
  }

  public async resolveApproval(
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    if (!this.#approvalManager) {
      throw new Error("当前 Agent 未配置审批管理器");
    }
    await this.#approvalManager.resolve(requestId, decision);
    if (decision.type === "custom") {
      await this.prompt(decision.text);
    }
  }

  public cancel(): void {
    this.#agent.abort();
  }

  public reset(): void {
    this.#agent.reset();
  }

  public subscribe(listener: CooltoAgentListener): () => void {
    const unsubscribeAgent = this.#agent.subscribe(
      async (event: AgentEvent, signal: AbortSignal) => {
        const mapped = mapPiEvent(event);
        if (mapped) {
          await listener(mapped, signal);
        }
      },
    );
    const unsubscribeApprovals = this.#approvalManager?.subscribe(
      async (event) => listener(event, new AbortController().signal),
    );
    return () => {
      unsubscribeAgent();
      unsubscribeApprovals?.();
    };
  }
}
