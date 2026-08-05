export const RESUME_TRACE_SCHEMA_VERSION = "resume-generation-trace-v1" as const;

export type ResumeTraceStage =
  | "generation_started"
  | "source_snapshot"
  | "model_call"
  | "tool"
  | "patch"
  | "chromium_compile"
  | "quality_review"
  | "draft_saved"
  | "qualified_preview_delivered"
  | "save_prepared"
  | "generation_finished";

export type ResumeTraceOutcome = "success" | "error";

export interface ResumeTraceModelUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning?: number;
}

export interface ResumeTraceEvent {
  traceId: string;
  stage: ResumeTraceStage;
  offsetMs: number;
  durationMs?: number;
  outcome?: ResumeTraceOutcome;
  toolName?: string;
  workspaceStatus?: string;
  usage?: ResumeTraceModelUsage;
}

export interface ResumeGenerationTrace {
  schemaVersion: typeof RESUME_TRACE_SCHEMA_VERSION;
  traceId: string;
  modelId: string;
  startedAt: string;
  completedAt: string | null;
  outcome: ResumeTraceOutcome | null;
  workspaceStatus: string | null;
  events: readonly ResumeTraceEvent[];
}

export interface ResumeGenerationRunSummary {
  traceId: string;
  elapsedMs: number;
  modelCallCount: number;
  compileCount: number;
  repairRoundCount: number;
  qualifiedPreviewDelivered: boolean;
  outcome: ResumeTraceOutcome;
  workspaceStatus: string | null;
  stageDurationsMs: Readonly<Record<string, number>>;
  modelUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
}
