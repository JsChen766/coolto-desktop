export const RESUME_TRACE_SCHEMA_VERSION = "resume-generation-trace-v3" as const;

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
  revision?: number;
  actionMode?: string;
  requestedTargetCount?: number;
  measuredTailCount?: number;
  appliedTailCount?: number;
  rejectedTailCount?: number;
  measuredRewriteCount?: number;
  appliedRewriteCount?: number;
  stackedProgressCount?: number;
  heightGrowthCount?: number;
  remainingTailCount?: number;
  errorCategory?: ResumeTraceErrorCategory;
  stopReason?: ResumeTraceStopReason;
}

export type ResumeTraceErrorCategory =
  | "schema"
  | "stale_revision"
  | "validation"
  | "runtime";

export type ResumeTraceStopReason =
  | "completed"
  | "repetition_guard"
  | "turn_limit"
  | "insufficient_credits"
  | "cancelled"
  | "runtime_error";

export interface ResumeTraceToolMetadata {
  revision?: number;
  actionMode?: string;
  requestedTargetCount?: number;
  measuredTailCount?: number;
  appliedTailCount?: number;
  rejectedTailCount?: number;
  measuredRewriteCount?: number;
  appliedRewriteCount?: number;
  stackedProgressCount?: number;
  heightGrowthCount?: number;
  remainingTailCount?: number;
  errorCategory?: ResumeTraceErrorCategory;
}

export interface ResumeGenerationTrace {
  schemaVersion: typeof RESUME_TRACE_SCHEMA_VERSION;
  traceId: string;
  modelId: string;
  startedAt: string;
  completedAt: string | null;
  outcome: ResumeTraceOutcome | null;
  workspaceStatus: string | null;
  stopReason: ResumeTraceStopReason | null;
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
  stopReason: ResumeTraceStopReason | null;
  stageDurationsMs: Readonly<Record<string, number>>;
  modelUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
}
