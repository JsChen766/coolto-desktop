import type {
  ResumeGenerationRunSummary,
  ResumeGenerationTrace,
} from "./trace-types.js";

export function summarizeTrace(trace: ResumeGenerationTrace): ResumeGenerationRunSummary {
  const elapsedMs = trace.events.at(-1)?.offsetMs ?? 0;
  const stageDurationsMs = trace.events.reduce<Record<string, number>>(
    (durations, event) => {
      if (event.durationMs !== undefined) {
        durations[event.stage] = (durations[event.stage] ?? 0) + event.durationMs;
      }
      return durations;
    },
    {},
  );
  return {
    traceId: trace.traceId,
    elapsedMs,
    modelCallCount: count(trace, "model_call"),
    compileCount: count(trace, "chromium_compile"),
    repairRoundCount: count(trace, "patch"),
    qualifiedPreviewDelivered: count(trace, "qualified_preview_delivered") > 0,
    outcome: trace.outcome ?? "error",
    workspaceStatus: trace.workspaceStatus,
    stopReason: trace.stopReason,
    stageDurationsMs,
    modelUsage: totalModelUsage(trace),
  };
}

function totalModelUsage(trace: ResumeGenerationTrace): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
} {
  return trace.events
    .filter((event) => event.stage === "model_call" && event.usage)
    .reduce(
      (totals, event) => ({
        inputTokens: totals.inputTokens + (event.usage?.input ?? 0),
        outputTokens: totals.outputTokens + (event.usage?.output ?? 0),
        cacheReadTokens: totals.cacheReadTokens + (event.usage?.cacheRead ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    );
}

function count(trace: ResumeGenerationTrace, stage: string): number {
  return trace.events.filter((event) => event.stage === stage).length;
}
