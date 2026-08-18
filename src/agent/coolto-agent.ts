import {
  Agent,
  type AgentEvent,
  type AgentMessage,
} from "@earendil-works/pi-agent-core";

import { ApprovalManager } from "../approvals/approval-manager.js";
import type {
  ApprovalDecision,
  ApprovalRequest,
} from "../approvals/types.js";
import {
  isTransientModelError,
  MODEL_TRANSIENT_ERROR,
  OUTPUT_REPETITION_ERROR,
  TURN_GOVERNOR_ERROR,
} from "./agent-errors.js";
import type { CooltoAgentListener, CooltoAgentOptions } from "./coolto-agent-types.js";
import { mapPiEvent } from "./events.js";
import { recoverFromOutputRepetition } from "./model-output-recovery.js";
import { wrapResumeGenerationFollowUp } from "./internal-prompt.js";
import { StreamingOutputRepetitionGuard } from "./output-repetition-guard.js";
import type { TurnGovernor } from "./turn-governor.js";

export class CooltoAgent {
  readonly #agent: Agent;
  readonly #approvalManager: ApprovalManager | undefined;
  readonly #outputRepetitionGuard = new StreamingOutputRepetitionGuard();
  readonly #turnGovernor: TurnGovernor | undefined;
  #modelCallCount = 0;
  #stoppedForOutputRepetition = false;
  #outputRecoveryRemaining = 0;
  #modelErrorMessage: string | undefined;
  #transientRecoveryRemaining = 0;
  #promptSequence = 0;

  public constructor(options: CooltoAgentOptions) {
    this.#approvalManager = options.approvalManager;
    this.#turnGovernor = options.turnGovernor;
    this.#agent = new Agent({
      initialState: {
        systemPrompt: options.systemPrompt,
        model: options.model,
        tools: options.tools,
        thinkingLevel: options.thinkingLevel ?? "off",
      },
      streamFn: options.streamFn,
      // Read-only tools may run together. Tools that mutate a workspace or
      // prepare an approval opt back into sequential execution themselves.
      toolExecution: "parallel",
      ...(options.getApiKey ? { getApiKey: options.getApiKey } : {}),
      ...(options.beforeToolCall
        ? { beforeToolCall: options.beforeToolCall }
        : {}),
      ...(options.transformContext
        ? { transformContext: options.transformContext }
        : {}),
      ...(options.shouldStopAfterTurn
        ? { shouldStopAfterTurn: options.shouldStopAfterTurn }
        : {}),
    });
    this.#agent.subscribe((event) => {
      if (event.type === "message_start" && event.message.role === "assistant") {
        this.#modelCallCount += 1;
        this.#outputRepetitionGuard.reset();
      }
      if (
        event.type === "message_update" &&
        (event.assistantMessageEvent.type === "text_delta" ||
          event.assistantMessageEvent.type === "thinking_delta") &&
        this.#outputRepetitionGuard.append(event.assistantMessageEvent.delta)
      ) {
        this.#stoppedForOutputRepetition = true;
        this.#agent.abort();
      }
      if (event.type === "message_end" && event.message.role === "assistant") {
        this.#modelErrorMessage = event.message.stopReason === "error"
          ? event.message.errorMessage ?? "模型调用失败"
          : undefined;
      }
      if (
        event.type === "turn_end" &&
        event.message.role === "assistant" && event.toolResults.length === 0 &&
        event.message.stopReason !== "error" &&
        event.message.stopReason !== "aborted"
      ) {
        const followUp = options.automaticFollowUp?.(this.#promptSequence);
        if (followUp) {
          this.#agent.followUp({ role: "user",
            content: wrapResumeGenerationFollowUp(followUp), timestamp: Date.now() });
        }
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

  public get stoppedForOutputRepetition(): boolean {
    return this.#stoppedForOutputRepetition;
  }

  public get runStopError(): string | undefined {
    const guardError = this.#guardStopError;
    if (guardError) return guardError;
    if (!this.#modelErrorMessage) return undefined;
    return isTransientModelError(this.#modelErrorMessage)
      ? MODEL_TRANSIENT_ERROR
      : this.#modelErrorMessage;
  }

  public get toolNames(): string[] {
    return this.#agent.state.tools.map((tool) => tool.name);
  }

  public async prompt(input: string): Promise<void> {
    const text = input.trim();
    if (text.length === 0) {
      return;
    }
    this.#stoppedForOutputRepetition = false;
    this.#promptSequence += 1;
    this.#outputRecoveryRemaining = 2;
    this.#modelErrorMessage = undefined;
    this.#transientRecoveryRemaining = 1;
    this.#turnGovernor?.reset();
    this.#outputRepetitionGuard.reset();
    await this.#agent.prompt(text);
    while (
      this.#stoppedForOutputRepetition &&
      this.#outputRecoveryRemaining > 0 &&
      this.#discardAbortedAssistantMessage()
    ) {
      this.#outputRecoveryRemaining -= 1;
      this.#stoppedForOutputRepetition = false;
      this.#outputRepetitionGuard.reset();
      await recoverFromOutputRepetition(this.#agent);
    }
    if (
      isTransientModelError(this.#modelErrorMessage) &&
      this.#transientRecoveryRemaining > 0 &&
      this.#discardAbortedAssistantMessage()
    ) {
      this.#transientRecoveryRemaining -= 1;
      this.#modelErrorMessage = undefined;
      await this.#agent.continue();
    }
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
          if (
            mapped.type === "run.failed" &&
            isTransientModelError(this.#modelErrorMessage) &&
            this.#transientRecoveryRemaining > 0
          ) return;
          if (
            mapped.type === "run.completed" &&
            isTransientModelError(this.#modelErrorMessage) &&
            this.#transientRecoveryRemaining > 0
          ) return;
          if (
            mapped.type === "run.completed" &&
            this.#guardStopError
          ) {
            if (
              this.#stoppedForOutputRepetition &&
              this.#outputRecoveryRemaining > 0
            ) return;
            await listener(
              { type: "run.failed", message: this.#guardStopError! },
              signal,
            );
            return;
          }
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

  #discardAbortedAssistantMessage(): boolean {
    const messages = this.#agent.state.messages;
    const last = messages.at(-1);
    if (last?.role !== "assistant") return false;
    this.#agent.state.messages = messages.slice(0, -1);
    return true;
  }

  get #guardStopError(): string | undefined {
    if (this.#stoppedForOutputRepetition) return OUTPUT_REPETITION_ERROR;
    return this.#turnGovernor?.stopReason ? TURN_GOVERNOR_ERROR : undefined;
  }
}

export { OUTPUT_REPETITION_ERROR, TURN_GOVERNOR_ERROR } from "./agent-errors.js";
export type { CooltoAgentOptions, CooltoAgentListener } from "./coolto-agent-types.js";
