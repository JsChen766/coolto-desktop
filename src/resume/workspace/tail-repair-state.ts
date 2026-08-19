import { tailGrowthFingerprint } from "./tail-repair-fingerprint.js";

export { tailGrowthFingerprint } from "./tail-repair-fingerprint.js";

export const MAX_TAIL_GROWTH_REJECTIONS = 4;
export const MAX_TAIL_REFLOW_ATTEMPTS = 2;

export type TailRepairMode = "growth" | "reflow";

export type TailGrowthFailureType =
  | "too_long"
  | "insufficient_growth"
  | "invalid_content"
  | "duplicate";

export interface TailRepairBulletProgress {
  mode?: TailRepairMode;
  consecutiveRejects: number;
  rejectedGrowthFingerprints?: string[];
  rejectedGrowths?: string[];
  lastFailureType?: TailGrowthFailureType;
  reflowAttempts?: number;
  rejectedReflowFingerprints?: string[];
  rejectedReflows?: string[];
  /** Legacy fields are read from persisted drafts and are no longer written. */
  zeroProgressRounds?: number;
  rejectedTextFingerprints?: string[];
  rejectedAttempts?: string[];
}

export interface TailRepairProgressState {
  byBulletId: Record<string, TailRepairBulletProgress>;
  stalled: boolean;
}

export interface TailRepairProgressOutcome {
  bulletId: string;
  applied: boolean;
  growthFingerprint: string;
  rejectedGrowth?: string;
  failureType?: TailGrowthFailureType;
}

export interface TailReflowProgressOutcome {
  bulletId: string;
  applied: boolean;
  rewriteFingerprint: string;
  rejectedRewrite?: string;
}

export function updateTailRepairProgress(
  previous: TailRepairProgressState | undefined,
  outcomes: readonly TailRepairProgressOutcome[],
  failedBulletIds: ReadonlySet<string>,
): TailRepairProgressState {
  const outcomeById = new Map(outcomes.map((outcome) => [
    outcome.bulletId,
    outcome,
  ]));
  const byBulletId: Record<string, TailRepairBulletProgress> = {};
  for (const bulletId of failedBulletIds) {
    const prior = previous?.byBulletId[bulletId];
    const outcome = outcomeById.get(bulletId);
    if (!outcome) {
      if (prior) byBulletId[bulletId] = migrateProgress(prior);
      continue;
    }
    if (outcome.applied) {
      byBulletId[bulletId] = {
        mode: "reflow",
        consecutiveRejects: 0,
        reflowAttempts: 0,
      };
      continue;
    }
    byBulletId[bulletId] = {
      mode: "growth",
      consecutiveRejects: Math.min(
        MAX_TAIL_GROWTH_REJECTIONS,
        rejectionCount(prior) + 1,
      ),
      rejectedGrowthFingerprints: appendBounded(
        prior?.rejectedGrowthFingerprints ?? prior?.rejectedTextFingerprints,
        outcome.growthFingerprint,
        6,
      ),
      ...(outcome.rejectedGrowth
        ? {
          rejectedGrowths: appendBounded(
            prior?.rejectedGrowths ?? prior?.rejectedAttempts,
            outcome.rejectedGrowth,
            2,
          ),
        }
        : {}),
      ...(outcome.failureType ? { lastFailureType: outcome.failureType } : {}),
    };
  }
  return {
    byBulletId,
    stalled: failedBulletIds.size > 0 && [...failedBulletIds].every(
      (bulletId) => isTailRepairExhausted(byBulletId[bulletId]),
    ),
  };
}

export function updateTailReflowProgress(
  previous: TailRepairProgressState | undefined,
  outcomes: readonly TailReflowProgressOutcome[],
  failedBulletIds: ReadonlySet<string>,
): TailRepairProgressState {
  const outcomeById = new Map(outcomes.map((outcome) => [
    outcome.bulletId,
    outcome,
  ]));
  const byBulletId: Record<string, TailRepairBulletProgress> = {};
  for (const bulletId of failedBulletIds) {
    const prior = previous?.byBulletId[bulletId];
    const outcome = outcomeById.get(bulletId);
    if (!outcome) {
      if (prior) byBulletId[bulletId] = migrateProgress(prior);
      continue;
    }
    const migrated = migrateProgress(prior ?? { consecutiveRejects: 0 });
    byBulletId[bulletId] = {
      ...migrated,
      mode: "reflow",
      reflowAttempts: outcome.applied
        ? migrated.reflowAttempts ?? 0
        : Math.min(
            MAX_TAIL_REFLOW_ATTEMPTS,
            (migrated.reflowAttempts ?? 0) + 1,
          ),
      ...(outcome.rejectedRewrite
        ? {
          rejectedReflowFingerprints: appendBounded(
            migrated.rejectedReflowFingerprints,
            outcome.rewriteFingerprint,
            MAX_TAIL_REFLOW_ATTEMPTS,
          ),
          rejectedReflows: appendBounded(
            migrated.rejectedReflows,
            outcome.rejectedRewrite,
            MAX_TAIL_REFLOW_ATTEMPTS,
          ),
        }
        : {}),
    };
  }
  return {
    byBulletId,
    stalled: failedBulletIds.size > 0 && [...failedBulletIds].every(
      (bulletId) => isTailRepairExhausted(byBulletId[bulletId]),
    ),
  };
}

export function wasRejectedTailGrowth(
  state: TailRepairProgressState | undefined,
  bulletId: string,
  growthText: string,
): boolean {
  const progress = state?.byBulletId[bulletId];
  const fingerprint = tailGrowthFingerprint(growthText);
  return progress?.rejectedGrowthFingerprints?.includes(fingerprint) === true ||
    progress?.rejectedTextFingerprints?.includes(fingerprint) === true;
}

export function retainFailedTailProgress(
  state: TailRepairProgressState | undefined,
  failedBulletIds: ReadonlySet<string>,
): TailRepairProgressState | undefined {
  if (!state) return undefined;
  const byBulletId = Object.fromEntries(Object.entries(state.byBulletId)
    .filter(([bulletId]) => failedBulletIds.has(bulletId))
    .map(([bulletId, progress]) => [bulletId, migrateProgress(progress)]));
  if (!Object.keys(byBulletId).length) return undefined;
  return {
    byBulletId,
    stalled: [...failedBulletIds].every((bulletId) =>
      isTailRepairExhausted(byBulletId[bulletId])
    ),
  };
}

export function tailRepairMode(
  progress: TailRepairBulletProgress | undefined,
): TailRepairMode {
  return progress?.mode ?? "growth";
}

export function isTailRepairExhausted(
  progress: TailRepairBulletProgress | undefined,
): boolean {
  return tailRepairMode(progress) === "reflow"
    ? (progress?.reflowAttempts ?? 0) >= MAX_TAIL_REFLOW_ATTEMPTS
    : isTailGrowthExhausted(progress);
}

export function isTailGrowthExhausted(
  progress: TailRepairBulletProgress | undefined,
): boolean {
  return tailRepairMode(progress) === "growth" &&
    rejectionCount(progress) >= MAX_TAIL_GROWTH_REJECTIONS;
}

function rejectionCount(progress: TailRepairBulletProgress | undefined): number {
  return progress?.consecutiveRejects ?? progress?.zeroProgressRounds ?? 0;
}

function migrateProgress(progress: TailRepairBulletProgress): TailRepairBulletProgress {
  return {
    mode: progress.mode ?? "growth",
    consecutiveRejects: rejectionCount(progress),
    ...(progress.rejectedGrowthFingerprints?.length ||
        progress.rejectedTextFingerprints?.length
      ? {
        rejectedGrowthFingerprints:
          progress.rejectedGrowthFingerprints ?? progress.rejectedTextFingerprints,
      }
      : {}),
    ...(progress.rejectedGrowths?.length || progress.rejectedAttempts?.length
      ? { rejectedGrowths: progress.rejectedGrowths ?? progress.rejectedAttempts }
      : {}),
    ...(progress.lastFailureType ? { lastFailureType: progress.lastFailureType } : {}),
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

function appendBounded(
  previous: readonly string[] | undefined,
  value: string,
  limit: number,
): string[] {
  return [...(previous ?? []).filter((entry) => entry !== value), value]
    .slice(-limit);
}
