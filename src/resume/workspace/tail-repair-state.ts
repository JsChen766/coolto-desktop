import { tailGrowthFingerprint } from "./tail-repair-fingerprint.js";
import { RESUME_TAIL_POLICY_V2 } from "../tail-policy.js";
import type { TailAttemptFeedback } from "./tail-attempt-feedback.js";
import type { TailLengthBudget } from "./tail-length-budget.js";
import {
  appendBounded,
  growthAttemptCount,
  migrateTailProgress,
  rejectionCount,
} from "./tail-repair-progress-helpers.js";

export type { TailAttemptFeedback } from "./tail-attempt-feedback.js";
export { tailGrowthFingerprint } from "./tail-repair-fingerprint.js";
export const MAX_TAIL_GROWTH_REJECTIONS = RESUME_TAIL_POLICY_V2.maxGrowthAttempts;
export const MAX_TAIL_REFLOW_ATTEMPTS = 2;
export type TailRepairMode = "growth" | "reflow";
export type TailGrowthFailureType =
  | "too_long"
  | "insufficient_growth"
  | "invalid_content"
  | "duplicate";
export interface TailRepairBulletProgress {
  mode?: TailRepairMode;
  growthAttempts?: number;
  consecutiveRejects: number;
  rejectedGrowthFingerprints?: string[];
  rejectedGrowths?: string[];
  lastFailureType?: TailGrowthFailureType;
  lastFailureReason?: string;
  lastAttemptFeedback?: TailAttemptFeedback;
  reflowAttempts?: number;
  rejectedReflowFingerprints?: string[];
  rejectedReflows?: string[];
  /** Best valid measured rewrite below the hard gate; never a formal revision. */
  workingText?: string;
  workingLineCount?: number;
  workingLastLineRatio?: number;
  workingLengthBudget?: TailLengthBudget;
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
  failureReason?: string;
  attemptFeedback?: TailAttemptFeedback;
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
      if (prior) byBulletId[bulletId] = migrateTailProgress(prior);
      continue;
    }
    if (outcome.applied) {
      const growthAttempts = nextGrowthAttempts(prior);
      byBulletId[bulletId] = {
        mode: growthAttempts >= MAX_TAIL_GROWTH_REJECTIONS
          ? "reflow"
          : "growth",
        growthAttempts,
        consecutiveRejects: 0,
        reflowAttempts: 0,
        ...(outcome.attemptFeedback
          ? { lastAttemptFeedback: outcome.attemptFeedback }
          : {}),
      };
      continue;
    }
    const growthAttempts = nextGrowthAttempts(prior);
    byBulletId[bulletId] = {
      mode: growthAttempts >= MAX_TAIL_GROWTH_REJECTIONS
        ? "reflow"
        : "growth",
      growthAttempts,
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
      ...recoveryReason(prior, outcome),
      ...(outcome.attemptFeedback
        ? { lastAttemptFeedback: outcome.attemptFeedback }
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
    .map(([bulletId, progress]) => [bulletId, migrateTailProgress(progress)]));
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
    growthAttemptCount(progress) >= MAX_TAIL_GROWTH_REJECTIONS;
}

function nextGrowthAttempts(
  progress: TailRepairBulletProgress | undefined,
): number {
  return Math.min(
    MAX_TAIL_GROWTH_REJECTIONS,
    growthAttemptCount(progress) + 1,
  );
}

function recoveryReason(
  prior: TailRepairBulletProgress | undefined,
  outcome: TailRepairProgressOutcome,
): Pick<TailRepairBulletProgress, "lastFailureReason"> | object {
  const reason = outcome.failureType === "duplicate"
    ? prior?.lastFailureReason ?? outcome.failureReason
    : outcome.failureReason;
  return reason ? { lastFailureReason: reason } : {};
}
