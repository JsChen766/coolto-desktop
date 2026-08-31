import type { AfterToolCallContext } from "@earendil-works/pi-agent-core";

import type { BrowserAgentController } from "../browser/agent-control-types.js";
import type { AgentHarnessServices } from "./agent-harness-services.js";
import { canonicalHash } from "./canonical-hash.js";
import { ManagedTaskObservationCache } from "./managed-task-observation-cache.js";
import {
  managedTaskActiveContext,
  toManagedTaskJson,
} from "./managed-task-target-context.js";
import type { ActionTokenV1 } from "./receipt-types.js";

interface StartedCall {
  runId: string;
  taskId: string;
  toolName: string;
}

interface PendingAction {
  evidenceRef: string | null;
  token: ActionTokenV1;
}

export class ManagedTaskExecutionState {
  readonly #calls = new Map<string, StartedCall>();
  readonly #observations = new ManagedTaskObservationCache();
  readonly #pending = new Map<string, PendingAction>();

  public constructor(
    private readonly conversationId: string,
    private readonly services: AgentHarnessServices,
    private readonly browser: BrowserAgentController,
  ) {}

  public observation(
    runId: string,
    tabId: string | null,
    url: string | null,
  ): { evidenceRef: string | null; hash: string | null } {
    return {
      evidenceRef: this.#observations.evidenceRef(runId, tabId, url),
      hash: this.#observations.hash(runId, tabId, url),
    };
  }

  public start(callId: string, value: StartedCall): void {
    this.#calls.set(callId, structuredClone(value));
  }

  public bindAction(
    callId: string,
    token: ActionTokenV1,
    evidenceRef: string | null,
  ): void {
    this.#pending.set(callId, { token, evidenceRef });
  }

  public async isActive(taskId: string, runId: string): Promise<boolean> {
    const task = await this.services.tasks.findRunningByConversation(this.conversationId);
    return task?.id === taskId && task.activeRunId === runId;
  }

  public rejectAction(
    token: ActionTokenV1,
    toolCallId: string,
    errorCode: string,
  ): Promise<unknown> {
    return this.services.ledger.consume({
      tokenId: token.id, toolCallId,
      targetOrigin: token.targetOrigin, tabId: token.tabId,
      observationHash: token.observationHash, status: "blocked",
      observationAfterHash: null, errorCode,
    });
  }

  public async after(context: AfterToolCallContext): Promise<void> {
    const call = this.#calls.get(context.toolCall.id);
    const pending = this.#pending.get(context.toolCall.id);
    try {
      if (call?.toolName === "browser_snapshot" && !context.isError &&
          await this.isActive(call.taskId, call.runId)) {
        const evidenceRef = await this.#saveObservation(call, context);
        this.#observations.record(call.runId, context.result.details, evidenceRef);
      }
      if (pending) await this.#consumePending(context, pending);
    } finally {
      this.#calls.delete(context.toolCall.id);
      this.#pending.delete(context.toolCall.id);
    }
  }

  async #consumePending(
    context: AfterToolCallContext,
    pending: PendingAction,
  ): Promise<void> {
    const token = pending.token;
    const actual = this.#actualContext(context.toolCall.name, token);
    await this.services.ledger.consume({
      tokenId: token.id, toolCallId: context.toolCall.id,
      targetOrigin: actual.origin, tabId: actual.tabId,
      observationHash: actual.observationHash,
      status: context.isError ? "failed" : "succeeded",
      observationAfterHash: this.#activeObservationHash(token.runId),
      errorCode: context.isError ? "tool_execution_failed" : null,
      evidenceRefs: pending.evidenceRef ? [pending.evidenceRef] : [],
    });
  }

  #actualContext(toolName: string, token: ActionTokenV1): {
    origin: string | null;
    tabId: string | null;
    observationHash: string | null;
  } {
    if (!toolName.startsWith("browser_") ||
        ["browser_close_tab", "browser_download"].includes(toolName)) {
      return {
        origin: token.targetOrigin, tabId: token.tabId,
        observationHash: token.observationHash,
      };
    }
    const active = managedTaskActiveContext(
      this.browser, toolName === "browser_new_tab" ? null : undefined,
    );
    return {
      origin: active.origin, tabId: active.tabId,
      observationHash: this.#observations.hash(
        token.runId, active.tabId, active.url,
      ),
    };
  }

  #activeObservationHash(runId: string): string | null {
    const tab = this.browser.getActiveTab();
    return tab ? this.#observations.hash(runId, tab.id, tab.url) : null;
  }

  async #saveObservation(
    call: StartedCall,
    context: AfterToolCallContext,
  ): Promise<string | null> {
    const evidence = this.services.evidence;
    if (!evidence) return null;
    const payload = toManagedTaskJson({
      content: context.result.content, details: context.result.details,
    });
    const createdAt = new Date().toISOString();
    const saved = await evidence.save({
      taskId: call.taskId, runId: call.runId, kind: "browser_observation",
      payloadHash: canonicalHash(payload), payload, createdAt,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return saved.id;
  }
}
