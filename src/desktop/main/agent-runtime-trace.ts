import type { ResumeToolProgress } from "../../agent/tool-progress.js";
import type {
  ResumeTraceErrorCategory,
  ResumeTraceStopReason,
  ResumeTraceToolMetadata,
} from "../../resume/performance/trace-types.js";

export function traceToolMetadata(
  progress: ResumeToolProgress | undefined,
  error: string | undefined,
): ResumeTraceToolMetadata {
  return {
    ...(progress?.revision !== undefined ? { revision: progress.revision } : {}),
    ...(progress?.phase ? { actionMode: progress.phase } : {}),
    ...metric(progress, "requestedTargetCount"),
    ...metric(progress, "measuredTailCount"),
    ...metric(progress, "appliedTailCount"),
    ...metric(progress, "rejectedTailCount"),
    ...metric(progress, "measuredRewriteCount"),
    ...metric(progress, "appliedRewriteCount"),
    ...metric(progress, "stackedProgressCount"),
    ...metric(progress, "heightGrowthCount"),
    ...metric(progress, "remainingTailCount"),
    ...(error ? { errorCategory: traceErrorCategory(error) } : {}),
  };
}

export function traceStopReason(message: string): ResumeTraceStopReason {
  if (/insufficient[_ -]?credits|余额不足/iu.test(message)) {
    return "insufficient_credits";
  }
  if (/重复|repetition|same output/iu.test(message)) return "repetition_guard";
  if (/turn.*limit|tool.*limit|调用上限|轮次上限/iu.test(message)) {
    return "turn_limit";
  }
  if (/abort|cancel|取消/iu.test(message)) return "cancelled";
  return "runtime_error";
}

function metric<K extends keyof ResumeTraceToolMetadata>(
  progress: ResumeToolProgress | undefined,
  key: K,
): Pick<ResumeTraceToolMetadata, K> | object {
  const value = progress?.[key as keyof ResumeToolProgress];
  return typeof value === "number"
    ? { [key]: value } as Pick<ResumeTraceToolMetadata, K>
    : {};
}

function traceErrorCategory(error: string): ResumeTraceErrorCategory {
  if (/schema|expected.*object|invalid.*argument/iu.test(error)) return "schema";
  if (/expectedRevision|stale.*revision/iu.test(error)) return "stale_revision";
  if (/验证|validation|必须|不得|缺少/iu.test(error)) return "validation";
  return "runtime";
}
