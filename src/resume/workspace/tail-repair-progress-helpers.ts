import type { TailRepairBulletProgress } from "./tail-repair-state.js";

export function rejectionCount(
  progress: TailRepairBulletProgress | undefined,
): number {
  return progress?.consecutiveRejects ?? progress?.zeroProgressRounds ?? 0;
}

export function growthAttemptCount(
  progress: TailRepairBulletProgress | undefined,
): number {
  return progress?.growthAttempts ?? rejectionCount(progress);
}

export function migrateTailProgress(
  progress: TailRepairBulletProgress,
): TailRepairBulletProgress {
  return {
    mode: progress.mode ?? "growth",
    growthAttempts: growthAttemptCount(progress),
    consecutiveRejects: rejectionCount(progress),
    ...(progress.rejectedGrowthFingerprints?.length ||
        progress.rejectedTextFingerprints?.length
      ? { rejectedGrowthFingerprints:
          progress.rejectedGrowthFingerprints ?? progress.rejectedTextFingerprints }
      : {}),
    ...(progress.rejectedGrowths?.length || progress.rejectedAttempts?.length
      ? { rejectedGrowths: progress.rejectedGrowths ?? progress.rejectedAttempts }
      : {}),
    ...(progress.lastFailureType ? { lastFailureType: progress.lastFailureType } : {}),
    ...(progress.lastFailureReason ? { lastFailureReason: progress.lastFailureReason } : {}),
    ...(progress.lastAttemptFeedback
      ? { lastAttemptFeedback: progress.lastAttemptFeedback }
      : {}),
    ...(progress.reflowAttempts !== undefined
      ? { reflowAttempts: progress.reflowAttempts }
      : {}),
    ...(progress.rejectedReflowFingerprints?.length
      ? { rejectedReflowFingerprints: progress.rejectedReflowFingerprints }
      : {}),
    ...(progress.rejectedReflows?.length
      ? { rejectedReflows: progress.rejectedReflows }
      : {}),
  };
}

export function appendBounded(
  previous: readonly string[] | undefined,
  value: string,
  limit: number,
): string[] {
  return [...(previous ?? []).filter((entry) => entry !== value), value]
    .slice(-limit);
}
