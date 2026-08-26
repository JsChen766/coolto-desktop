import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { ApprovalManager } from "../approvals/approval-manager.js";
import type { ApprovalDecision, ApprovalRequest } from "../approvals/types.js";
import { isTransientModelError, MODEL_TRANSIENT_ERROR, OUTPUT_REPETITION_ERROR,
  TURN_GOVERNOR_ERROR, outputRepetitionError } from "./agent-errors.js";
import type { CooltoAgentListener, CooltoAgentOptions } from "./coolto-agent-types.js";
import { guardFailureEvent, mapPiEvent } from "./events.js";
import { recoverFromOutputRepetition, recoverFromTurnGovernor,
  recoveryRequiresToolCall, recoveryStreamOptions } from "./model-output-recovery.js";
import { wrapResumeGenerationFollowUp } from "./internal-prompt.js";
import { StreamingOutputRepetitionGuard, type OutputRepetitionReason } from "./output-repetition-guard.js";
import type { TurnGovernor } from "./turn-governor.js";

export class CooltoAgent {
  readonly #agent: Agent;
  readonly #approvalManager: ApprovalManager | undefined;
  readonly #outputRepetitionGuard = new StreamingOutputRepetitionGuard();
  readonly #turnGovernor: TurnGovernor | undefined;
  readonly #outputRepetitionRecovery: CooltoAgentOptions["outputRepetitionRecovery"];
  readonly #turnGovernorRecovery: CooltoAgentOptions["turnGovernorRecovery"];
  #modelCallCount = 0;
  #stoppedForOutputRepetition = false;
  #outputRepetitionReason: OutputRepetitionReason | undefined;
  #requireToolCall = false;
  #modelErrorMessage: string | undefined;
  #transientRecoveryRemaining = 0;
  #promptSequence = 0;

  public constructor(options: CooltoAgentOptions) {
    this.#approvalManager = options.approvalManager;
    this.#turnGovernor = options.turnGovernor;
    this.#outputRepetitionRecovery = options.outputRepetitionRecovery;
    this.#turnGovernorRecovery = options.turnGovernorRecovery;
    this.#agent = new Agent({
      initialState: {
        systemPrompt: options.systemPrompt,
        model: options.model,
        tools: options.tools,
        thinkingLevel: options.thinkingLevel ?? "off",
      },
      streamFn: (model, context, streamOptions) => options.streamFn(
        model, context,
        recoveryStreamOptions(streamOptions, this.#requireToolCall),
      ),
      // Read-only tools may run together. Tools that mutate a workspace or
      // prepare an approval opt back into sequential execution themselves.
      toolExecution: "parallel",
      ...(options.getApiKey ? { getApiKey: options.getApiKey } : {}),
      ...(options.beforeToolCall ? { beforeToolCall: options.beforeToolCall } : {}),
      ...(options.transformContext ? { transformContext: options.transformContext } : {}),
      ...(options.shouldStopAfterTurn
        ? { shouldStopAfterTurn: options.shouldStopAfterTurn } : {}),
    });
    this.#agent.subscribe((event) => {
      if (event.type === "message_start" && event.message.role === "assistant") {
        this.#modelCallCount += 1;
        this.#outputRepetitionGuard.reset();
        this.#outputRepetitionReason = undefined;
      }
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta" &&
        (this.#outputRepetitionReason = this.#outputRepetitionGuard.append(
          event.assistantMessageEvent.delta,
        ))
      ) {
        this.#stoppedForOutputRepetition = true;
        this.#agent.abort();
      }
      if (event.type === "message_end" && event.message.role === "assistant") {
        this.#modelErrorMessage = event.message.stopReason === "error"
          ? event.message.errorMessage ?? "模型调用失败"
          : undefined;
      }
      if (event.type === "tool_execution_start") {
        this.#requireToolCall = false;
      }
      if (
        event.type === "turn_end" &&
        event.message.role === "assistant" && event.toolResults.length === 0 &&
        event.message.stopReason !== "error" &&
        event.message.stopReason !== "aborted"
      ) {
        const followUp = options.automaticFollowUp?.(this.#promptSequence);
        if (followUp) {
          this.#requireToolCall = true;
          this.#agent.followUp({ role: "user",
            content: wrapResumeGenerationFollowUp(followUp), timestamp: Date.now() });
        }
      }
    });
  }

  public get isRunning(): boolean { return this.#agent.state.isStreaming; }
  /** Total assistant model calls across all prompts since construction. */
  public get modelCallCount(): number { return this.#modelCallCount; }
  public get stoppedForOutputRepetition(): boolean {
    return this.#stoppedForOutputRepetition;
  }
  public get outputRepetitionReason(): OutputRepetitionReason | undefined {
    return this.#outputRepetitionReason;
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
    if (text.length === 0) return;
    this.#stoppedForOutputRepetition = false;
    this.#outputRepetitionReason = undefined;
    this.#promptSequence += 1;
    this.#modelErrorMessage = undefined;
    this.#transientRecoveryRemaining = 1;
    this.#turnGovernor?.reset();
    this.#outputRepetitionGuard.reset();
    await this.#agent.prompt(text);
    this.#requireToolCall = false;
    while (
      this.#stoppedForOutputRepetition &&
      this.#discardAbortedAssistantMessage()
    ) {
      const recoveryAuthority = this.#outputRepetitionReason
        ? this.#outputRepetitionRecovery?.(
            this.#promptSequence, this.#outputRepetitionReason)
        : undefined;
      this.#stoppedForOutputRepetition = false;
      this.#outputRepetitionGuard.reset();
      this.#requireToolCall = recoveryRequiresToolCall(recoveryAuthority);
      try {
        await recoverFromOutputRepetition(this.#agent, recoveryAuthority);
      } finally {
        this.#requireToolCall = false;
      }
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
    await recoverFromTurnGovernor(
      this.#agent, this.#turnGovernor, this.#turnGovernorRecovery,
      this.#promptSequence,
    );
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
            if (this.#stoppedForOutputRepetition) return;
            await listener(guardFailureEvent(
              this.#guardStopError!, this.#turnGovernor?.stopReason,
            ), signal);
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
    if (this.#stoppedForOutputRepetition) {
      return outputRepetitionError(this.#outputRepetitionReason);
    }
    return this.#turnGovernor?.stopReason ? TURN_GOVERNOR_ERROR : undefined;
  }
}

export { OUTPUT_REPETITION_ERROR, TURN_GOVERNOR_ERROR } from "./agent-errors.js";
export type { CooltoAgentOptions, CooltoAgentListener } from "./coolto-agent-types.js";
