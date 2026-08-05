import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import {
  RESUME_TRACE_SCHEMA_VERSION,
  type ResumeGenerationRunSummary,
  type ResumeGenerationTrace,
  type ResumeTraceEvent,
  type ResumeTraceModelUsage,
  type ResumeTraceOutcome,
  type ResumeTraceStage,
} from "./trace-types.js";
import { summarizeTrace } from "./trace-summary.js";

const RESUME_TOOLS = new Set([
  "get_resume_source_snapshot",
  "prepare_resume_candidate",
  "patch_resume_candidate",
  "review_resume_candidate",
  "prepare_resume_save",
]);

export interface ResumeTraceClock {
  now(): Date;
  monotonicNow(): number;
}

interface ActiveTrace {
  trace: ResumeGenerationTrace;
  startedMonotonicMs: number;
  usesResumeFlow: boolean;
  readonly modelStartedAtMs: number[];
  readonly toolStartedAtMs: Map<string, { name: string; offsetMs: number }>;
}

export class ResumeGenerationTraceStore {
  readonly #clock: ResumeTraceClock;
  readonly #active = new Map<string, ActiveTrace>();
  readonly #completed: ResumeGenerationTrace[] = [];
  readonly #latestByConversation = new Map<string, ResumeGenerationTrace>();

  public constructor(clock: ResumeTraceClock = systemClock) {
    this.#clock = clock;
  }

  public start(conversationId: string, modelId: string): string {
    const traceId = randomUUID();
    const trace: ResumeGenerationTrace = {
      schemaVersion: RESUME_TRACE_SCHEMA_VERSION,
      traceId,
      modelId: modelId.trim() || "unknown-model",
      startedAt: this.#clock.now().toISOString(),
      completedAt: null,
      outcome: null,
      workspaceStatus: null,
      events: [],
    };
    const active: ActiveTrace = {
      trace,
      startedMonotonicMs: this.#clock.monotonicNow(),
      usesResumeFlow: false,
      modelStartedAtMs: [],
      toolStartedAtMs: new Map(),
    };
    this.#active.set(conversationId, active);
    this.#record(active, "generation_started");
    return traceId;
  }

  public recordModelStarted(conversationId: string): void {
    const active = this.#active.get(conversationId);
    if (active) active.modelStartedAtMs.push(this.#offset(active));
  }

  public recordModelCompleted(
    conversationId: string,
    outcome: ResumeTraceOutcome,
    usage?: ResumeTraceModelUsage,
  ): void {
    const active = this.#active.get(conversationId);
    if (!active) return;
    const startedAtMs = active.modelStartedAtMs.shift();
    const endedAtMs = this.#offset(active);
    this.#record(active, "model_call", {
      outcome,
      ...(usage ? { usage } : {}),
      ...(startedAtMs === undefined ? {} : { durationMs: endedAtMs - startedAtMs }),
    }, startedAtMs ?? endedAtMs);
  }

  public recordToolStarted(conversationId: string, callId: string, name: string): void {
    if (!RESUME_TOOLS.has(name)) return;
    const active = this.#active.get(conversationId);
    if (!active) return;
    active.usesResumeFlow = true;
    active.toolStartedAtMs.set(callId, { name, offsetMs: this.#offset(active) });
  }

  public recordTool(
    conversationId: string,
    callId: string,
    name: string,
    outcome: ResumeTraceOutcome,
  ): void {
    if (!RESUME_TOOLS.has(name)) return;
    const active = this.#active.get(conversationId);
    if (!active) return;
    active.usesResumeFlow = true;
    const started = active.toolStartedAtMs.get(callId);
    active.toolStartedAtMs.delete(callId);
    const endedAtMs = this.#offset(active);
    this.#record(active, stageForTool(name), {
      outcome,
      toolName: name,
      ...(started ? { durationMs: endedAtMs - started.offsetMs } : {}),
    }, started?.offsetMs ?? endedAtMs);
  }

  public recordCompile(conversationId: string, durationMs: number, outcome: ResumeTraceOutcome): void {
    const active = this.#active.get(conversationId);
    if (!active) return;
    active.usesResumeFlow = true;
    this.#record(active, "chromium_compile", { durationMs, outcome });
  }

  public recordDraftSaved(conversationId: string): void {
    const active = this.#active.get(conversationId);
    if (!active) return;
    active.usesResumeFlow = true;
    this.#record(active, "draft_saved", { outcome: "success" });
  }

  public recordQualifiedPreviewDelivered(conversationId: string): void {
    const active = this.#active.get(conversationId);
    if (!active) return;
    active.usesResumeFlow = true;
    this.#record(active, "qualified_preview_delivered", { outcome: "success" });
  }

  public finish(
    conversationId: string,
    input: { workspaceStatus: string | null; failed: boolean },
  ): ResumeGenerationTrace | undefined {
    const active = this.#active.get(conversationId);
    this.#active.delete(conversationId);
    if (!active || !active.usesResumeFlow) return undefined;
    const outcome: ResumeTraceOutcome = input.failed ? "error" : "success";
    active.trace = {
      ...active.trace,
      completedAt: this.#clock.now().toISOString(),
      outcome,
      workspaceStatus: input.workspaceStatus,
    };
    this.#record(active, "generation_finished", {
      outcome,
      ...(input.workspaceStatus
        ? { workspaceStatus: input.workspaceStatus }
        : {}),
    });
    const completed = structuredClone(active.trace);
    this.#completed.push(completed);
    this.#latestByConversation.set(conversationId, completed);
    return completed;
  }

  public latestForConversation(conversationId: string): ResumeGenerationTrace | undefined {
    const trace = this.#latestByConversation.get(conversationId);
    return trace ? structuredClone(trace) : undefined;
  }

  public summaries(): ResumeGenerationRunSummary[] {
    return this.#completed.map(summarizeTrace);
  }

  #record(
    active: ActiveTrace,
    stage: ResumeTraceStage,
    details: Omit<ResumeTraceEvent, "traceId" | "stage" | "offsetMs"> = {},
    offsetMs = this.#offset(active),
  ): void {
    const event: ResumeTraceEvent = {
      traceId: active.trace.traceId,
      stage,
      offsetMs: round(offsetMs),
      ...details,
    };
    active.trace = { ...active.trace, events: [...active.trace.events, event] };
  }

  #offset(active: ActiveTrace): number {
    return round(this.#clock.monotonicNow() - active.startedMonotonicMs);
  }
}

// Re-exported for callers that previously imported it from the store; the
// summary computation lives in trace-summary.ts.
export { summarizeTrace } from "./trace-summary.js";

function stageForTool(name: string): ResumeTraceStage {
  if (name === "get_resume_source_snapshot") return "source_snapshot";
  if (name === "patch_resume_candidate") return "patch";
  if (name === "review_resume_candidate") return "quality_review";
  if (name === "prepare_resume_save") return "save_prepared";
  return "tool";
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

const systemClock: ResumeTraceClock = {
  now: () => new Date(),
  monotonicNow: () => performance.now(),
};
