export type ResumeToolProgressPhase =
  | "drafting"
  | "depth_repair"
  | "filling"
  | "tail_repair"
  | "trimming"
  | "awaiting_material"
  | "awaiting_confirmation"
  | "complete";

export interface ResumeToolProgress {
  phase: ResumeToolProgressPhase;
  revision?: number;
  usageRatio?: number;
  pageCount?: number;
  remainingTailCount?: number;
  repairedTailCount?: number;
  advancedCandidateCount?: number;
  measuredCandidateCount?: number;
  requestedTargetCount?: number;
  submittedCandidateCount?: number;
  cachedCandidateCount?: number;
  selectedCandidateCount?: number;
  selectedFromCacheCount?: number;
  retainedCandidateCount?: number;
  measuredRewriteCount?: number;
  appliedRewriteCount?: number;
  stackedProgressCount?: number;
  heightGrowthCount?: number;
  skippedRewriteCount?: number;
  removedBulletCount?: number;
  appliedItemCount?: number;
}

const RESUME_TOOLS = new Set([
  "create_resume_workspace",
  "get_resume_workspace",
  "apply_resume_content",
  "add_resume_material",
  "pause_resume_for_material",
]);

export function projectToolProgress(
  toolName: string,
  result: unknown,
): ResumeToolProgress | undefined {
  if (!RESUME_TOOLS.has(toolName)) return undefined;
  const details = objectValue(objectValue(result)?.details);
  if (!details) return undefined;
  const layout = objectValue(details.layout);
  const nextAction = objectValue(details.nextAction);
  const readiness = objectValue(details.readiness);
  const feedback = Array.isArray(details.tailRepairFeedback)
    ? details.tailRepairFeedback
    : [];
  const operation = objectValue(details.operation);
  const tailDiagnostics = objectValue(details.tailRepairDiagnostics);
  const lineDiagnostics = objectValue(details.lineRewriteDiagnostics);
  const overflowDiagnostics = objectValue(
    details.overflowReductionDiagnostics,
  );
  const measuredCandidateCount = typeof tailDiagnostics?.submittedCandidateCount === "number"
    ? tailDiagnostics.submittedCandidateCount
    : feedback.reduce(
        (total, entry) => total + (
          Array.isArray(objectValue(entry)?.attempts)
            ? (objectValue(entry)!.attempts as unknown[]).length
            : 0
        ),
        0,
      );
  const progress: ResumeToolProgress = {
    phase: progressPhase(
      nextAction,
      readiness,
      Boolean(tailDiagnostics),
      typeof lineDiagnostics?.phase === "string"
        ? lineDiagnostics.phase
        : lineDiagnostics ? "page_fill" : undefined,
      Boolean(overflowDiagnostics),
    ),
    ...numberField("revision", details.revision),
    ...numberField("usageRatio", layout?.usageRatio),
    ...numberField("pageCount", layout?.pageCount),
    ...numberField("remainingTailCount", nextAction?.remainingTailCount),
    ...(tailDiagnostics
      ? { repairedTailCount: typeof tailDiagnostics.repairedTailCount === "number"
          ? tailDiagnostics.repairedTailCount
          : feedback.filter((entry) => {
              const value = objectValue(entry);
              return value?.selectedOptionIndex !== undefined ||
                value?.selectedFromCache === true;
            }).length }
      : {}),
    ...numberField("advancedCandidateCount", tailDiagnostics?.advancedCandidateCount),
    measuredCandidateCount,
    ...numberField(
      "requestedTargetCount",
      (tailDiagnostics ?? lineDiagnostics)?.requestedTargetCount,
    ),
    ...numberField("submittedCandidateCount", tailDiagnostics?.submittedCandidateCount),
    ...numberField("cachedCandidateCount", tailDiagnostics?.cachedCandidateCount),
    ...numberField("selectedCandidateCount", tailDiagnostics?.selectedCandidateCount),
    ...numberField("selectedFromCacheCount", tailDiagnostics?.selectedFromCacheCount),
    ...numberField("retainedCandidateCount", tailDiagnostics?.retainedCandidateCount),
    ...numberField("measuredRewriteCount", lineDiagnostics?.measuredRewriteCount),
    ...numberField("appliedRewriteCount", lineDiagnostics?.appliedRewriteCount),
    ...numberField("stackedProgressCount", lineDiagnostics?.stackedProgressCount),
    ...numberField("heightGrowthCount", lineDiagnostics?.heightGrowthCount),
    ...numberField("skippedRewriteCount", lineDiagnostics?.skippedRewriteCount),
    ...numberField("removedBulletCount", overflowDiagnostics?.removedBulletCount),
    ...(Array.isArray(operation?.appliedItemIds) && operation.appliedItemIds.length
      ? { appliedItemCount: operation.appliedItemIds.length }
      : {}),
  };
  return progress;
}

function progressPhase(
  action: Record<string, unknown> | undefined,
  readiness: Record<string, unknown> | undefined,
  completedTailRepair: boolean,
  completedLineExpansion: unknown,
  completedOverflowReduction: boolean,
): ResumeToolProgressPhase {
  if (readiness?.ready === true) return "complete";
  if (completedTailRepair) return "tail_repair";
  if (completedOverflowReduction) return "trimming";
  if (completedLineExpansion === "bullet_depth") return "depth_repair";
  if (completedLineExpansion) return "filling";
  switch (action?.mode) {
    case "repair_bullet_depth": return "depth_repair";
    case "increase_usage": return "filling";
    case "batch_tail_repair": return "tail_repair";
    case "reduce_overflow": return "trimming";
    case "request_more_material": return "awaiting_material";
    case "await_augmented_confirmation": return "awaiting_confirmation";
    default: return "drafting";
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function numberField<K extends string>(key: K, value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? { [key]: value } as Record<K, number>
    : {};
}
