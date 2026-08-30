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
  progressedTailCount?: number;
  measuredTailCount?: number;
  appliedTailCount?: number;
  rejectedTailCount?: number;
  validationRejectedTailCount?: number;
  lineCountRejectedTailCount?: number;
  insufficientGainRejectedTailCount?: number;
  validationReasonCounts?: {
    unchangedOrRepeated: number;
    contentQuality: number;
    unsupportedEvidence: number;
    other: number;
  };
  nextTailTargets?: Array<{
    bulletId: string;
    growthHint: string;
  }>;
  requestedTargetCount?: number;
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
  "assess_resume_evidence",
  "apply_resume_content",
  "add_resume_material",
  "pause_resume_for_material",
  "confirm_no_resume_material",
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
  const operation = objectValue(details.operation);
  const tailDiagnostics = objectValue(details.tailRepairDiagnostics);
  const lineDiagnostics = objectValue(details.lineRewriteDiagnostics);
  const overflowDiagnostics = objectValue(
    details.overflowReductionDiagnostics,
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
    ...numberField(
      "remainingTailCount",
      remainingTailCount(nextAction, layout, Boolean(tailDiagnostics)),
    ),
    ...(tailDiagnostics
      ? { repairedTailCount: typeof tailDiagnostics.appliedTargetCount === "number"
          ? tailDiagnostics.appliedTargetCount
          : 0 }
      : {}),
    ...numberField("progressedTailCount", tailDiagnostics?.progressedTargetCount),
    ...numberField(
      "measuredTailCount",
      tailDiagnostics?.measuredCandidateCount ??
        tailDiagnostics?.measuredTargetCount,
    ),
    ...numberField("appliedTailCount", tailDiagnostics?.appliedTargetCount),
    ...numberField(
      "rejectedTailCount",
      tailDiagnostics?.rejectedTargetCount ??
        sumNumbers(
          tailDiagnostics?.validationRejectedCandidateCount,
          tailDiagnostics?.layoutRejectedCandidateCount,
        ),
    ),
    ...numberField(
      "validationRejectedTailCount",
      tailDiagnostics?.validationRejectedTargetCount ??
        tailDiagnostics?.validationRejectedCandidateCount,
    ),
    ...numberField(
      "lineCountRejectedTailCount",
      tailDiagnostics?.lineCountRejectedTargetCount,
    ),
    ...numberField(
      "insufficientGainRejectedTailCount",
      tailDiagnostics?.insufficientGainRejectedTargetCount,
    ),
    ...validationReasonCounts(tailDiagnostics?.validationReasonCounts),
    ...nextTailTargets(nextAction),
    ...numberField(
      "requestedTargetCount",
      (tailDiagnostics ?? lineDiagnostics)?.requestedTargetCount,
    ),
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

function validationReasonCounts(value: unknown) {
  const counts = objectValue(value);
  const keys = [
    "unchangedOrRepeated",
    "contentQuality",
    "unsupportedEvidence",
    "other",
  ] as const;
  return counts && keys.every((key) => typeof counts[key] === "number")
    ? { validationReasonCounts: Object.fromEntries(
        keys.map((key) => [key, counts[key]]),
      ) as NonNullable<ResumeToolProgress["validationReasonCounts"]> }
    : {};
}

function nextTailTargets(action: Record<string, unknown> | undefined) {
  const source = action?.mode === "batch_tail_rewrite"
    ? action.tailRewriteTargets
    : undefined;
  if (!Array.isArray(source)) return {};
  const targets = source.flatMap((value) => {
    const target = objectValue(value);
    if (typeof target?.bulletId !== "string" ||
      typeof target.currentText !== "string") return [];
    return [{
      bulletId: target.bulletId,
      growthHint: typeof target.growthHint === "string"
        ? target.growthHint
        : "事实等价展开",
    }];
  });
  return targets.length ? { nextTailTargets: targets } : {};
}

function remainingTailCount(
  nextAction: Record<string, unknown> | undefined,
  layout: Record<string, unknown> | undefined,
  completedTailRepair: boolean,
): unknown {
  if (typeof nextAction?.remainingTailCount === "number") {
    return nextAction.remainingTailCount;
  }
  if (!completedTailRepair || !Array.isArray(layout?.violations)) {
    return undefined;
  }
  return layout.violations.filter((entry) =>
    objectValue(entry)?.code === "bullet_tail_too_short"
  ).length;
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
    case "increase_usage": return "filling";
    case "batch_tail_rewrite": return "tail_repair";
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

function sumNumbers(...values: unknown[]): number | undefined {
  const numbers = values.filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value)
  );
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) :
    undefined;
}
