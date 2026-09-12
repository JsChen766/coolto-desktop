import type { AfterToolCallContext } from "@earendil-works/pi-agent-core";
import type { BrowserAgentController } from "../browser/agent-control-types.js";
import type { AgentHarnessServices } from "./agent-harness-services.js";
import { canonicalHash } from "./canonical-hash.js";
import { ManagedTaskObservationCache } from "./managed-task-observation-cache.js";
import {
  managedTaskActiveContext,
  toManagedTaskJson,
} from "./managed-task-target-context.js";
import type { ActionTokenV1, ActionReceiptV1 } from "./receipt-types.js";
import {
  createRecruitingTakeoverState,
  enterRecruitingTakeover,
  resumeRecruitingTakeover,
  type RecruitingTakeoverReason,
  type RecruitingTakeoverState,
} from "../browser/recruiting-takeover-contract.js";
interface StartedCall { runId: string; taskId: string; toolName: string; }
interface PendingAction { evidenceRef: string | null; token: ActionTokenV1; }
const OBSERVATION_TOOLS: Record<string, true> = { browser_snapshot: true,
  browser_recruiting_form_observe: true, browser_recruiting_form_fill: true,
  browser_recruiting_form_select: true, browser_recruiting_form_set_checked: true,
  browser_recruiting_form_upload: true, browser_recruiting_form_review: true };
export class ManagedTaskExecutionState {
  readonly #calls = new Map<string, StartedCall>();
  #observations = new ManagedTaskObservationCache();
  readonly #pending = new Map<string, PendingAction>();
  #takeover: RecruitingTakeoverState | null = null;
  #formObservationInvalid = false;
  #taskId: string | null = null;
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
  public takeoverStatus(): RecruitingTakeoverState["status"] {
    return this.#formObservationInvalid ? "invalidated" : this.#takeover?.status ?? "agent";
  }
  public takeoverBlocked(): boolean {
    return this.takeoverStatus() !== "agent";
  }
  public start(callId: string, value: StartedCall): void {
    this.#calls.set(callId, structuredClone(value));
  }
  public resetForTask(taskId: string): void {
    if (this.#taskId === taskId) return;
    this.#taskId = taskId;
    this.#observations = new ManagedTaskObservationCache();
    this.#calls.clear(); this.#pending.clear();
    this.#takeover = null; this.#formObservationInvalid = false;
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
  public async after(context: AfterToolCallContext): Promise<boolean> {
    const call = this.#calls.get(context.toolCall.id);
    const pending = this.#pending.get(context.toolCall.id);
    let receiptRecorded = false;
    try {
      const isFormObservationTool = call?.toolName.startsWith("browser_recruiting_form_") === true;
      const validFormObservation = !isFormObservationTool ||
        readFormObservation(context.result.details) !== null;
      if (call && OBSERVATION_TOOLS[call.toolName] === true && validFormObservation &&
          !context.isError && await this.isActive(call.taskId, call.runId)) {
        const evidenceRef = await this.#saveObservation(call, context);
        this.#observations.record(call.runId, context.result.details, evidenceRef);
      }
      if (call && isFormObservationTool && !context.isError &&
          await this.isActive(call.taskId, call.runId)) {
        await this.#updateTakeover(call, context.result.details);
      }
      if (pending) {
        const receipt = await this.#consumePending(context, pending);
        receiptRecorded = !context.isError &&
          ["succeeded", "partial", "uncertain"].includes(receipt.status);
      }
      return receiptRecorded;
    } finally {
      this.#calls.delete(context.toolCall.id);
      this.#pending.delete(context.toolCall.id);
    }
  }
  async #consumePending(
    context: AfterToolCallContext,
    pending: PendingAction,
  ): Promise<ActionReceiptV1> {
    const token = pending.token;
    const actual = this.#actualContext(context.toolCall.name, token);
    return this.services.ledger.consume({
      tokenId: token.id, toolCallId: context.toolCall.id,
      targetOrigin: actual.origin, tabId: actual.tabId,
      observationHash: actual.observationHash,
      status: context.isError ? "failed" : "succeeded",
      observationAfterHash: this.#activeObservationHash(token.runId),
      errorCode: context.isError ? "tool_execution_failed" : null,
      evidenceRefs: pending.evidenceRef ? [pending.evidenceRef] : [],
    });
  }
  async #updateTakeover(
    call: StartedCall,
    details: unknown,
  ): Promise<void> {
    if (!await this.isActive(call.taskId, call.runId)) return;
    const observation = readFormObservation(details);
    if (!observation) {
      this.#formObservationInvalid = true;
      return;
    }
    const active = await this.services.grants.getActive(call.taskId);
    const grantHash = active.grant?.contentHash;
    if (!grantHash || !await this.isActive(call.taskId, call.runId)) return;
    this.#formObservationInvalid = false;
    const context = {
      taskId: call.taskId, runId: call.runId, tabId: observation.tabId,
      origin: observation.origin, observationHash: observation.observationHash,
      grantHash,
    };
    const existing = this.#takeover;
    if (observation.mode === "takeover") {
      if (!existing || existing.status !== "takeover" ||
          existing.context.taskId !== call.taskId ||
          existing.context.runId !== call.runId ||
          existing.context.tabId !== observation.tabId ||
          existing.context.origin !== observation.origin ||
          existing.context.grantHash !== grantHash ||
          existing.context.observationHash !== observation.observationHash) {
        this.#takeover = enterRecruitingTakeover(
          createRecruitingTakeoverState(context),
          reasonForTakeover(observation.surface),
        );
      }
      return;
    }
    if (observation.mode !== "synthetic_review") return;
    if (existing?.status === "takeover") {
      this.#takeover = resumeRecruitingTakeover(existing, context).state;
    }
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
type FormObservation = {
  mode: "takeover" | "synthetic_review" | "public_read_only" | "unsupported";
  surface: string;
  tabId: string;
  origin: string;
  observationHash: string;
};
const FORM_MODES: Record<string, true> = {
  takeover: true, synthetic_review: true, public_read_only: true, unsupported: true,
};
function readFormObservation(value: unknown): FormObservation | null {
  if (!value || typeof value !== "object") return null;
  const mode = Reflect.get(value, "mode");
  const surface = Reflect.get(value, "surface");
  const tabId = Reflect.get(value, "tabId");
  const origin = Reflect.get(value, "origin");
  const observationHash = Reflect.get(value, "observationHash");
  const cleanTabId = typeof tabId === "string" ? tabId.trim() : "";
  const cleanOrigin = typeof origin === "string" ? origin.trim() : "";
  const cleanHash = typeof observationHash === "string" ? observationHash.trim() : "";
  if (typeof mode !== "string" || !FORM_MODES[mode] ||
      typeof surface !== "string" || !surface.trim() ||
      !cleanTabId || !cleanOrigin || !cleanHash || cleanHash.length > 256) return null;
  return {
    mode: mode as FormObservation["mode"], surface: surface.trim(),
    tabId: cleanTabId, origin: cleanOrigin, observationHash: cleanHash,
  };
}
function reasonForTakeover(surface: string): RecruitingTakeoverReason {
  const reasons: Record<string, RecruitingTakeoverReason> = {
    auth: "auth", otp: "otp", captcha: "captcha", legal: "legal",
    sensitive: "sensitive", submit: "uncertain_submit",
  };
  return reasons[surface] ?? "unknown_field";
}
