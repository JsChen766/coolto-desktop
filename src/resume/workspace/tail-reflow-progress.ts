import type { TailLengthBudget } from "./tail-length-budget.js";
import {
  isTailRepairExhausted,
  MAX_TAIL_REFLOW_ATTEMPTS,
  type TailRepairBulletProgress,
  type TailRepairProgressState,
} from "./tail-repair-state.js";
import { appendBounded, migrateTailProgress } from
  "./tail-repair-progress-helpers.js";

const MAX_REFLOW_HISTORY = 12;

export interface TailReflowProgressOutcome {
  bulletId: string;
  applied: boolean;
  rewriteFingerprint: string;
  rejectedRewrite?: string;
  workingText?: string;
  workingLineCount?: number;
  workingLastLineRatio?: number;
  workingLengthBudget?: TailLengthBudget;
}

export function updateTailReflowProgress(
  previous: TailRepairProgressState | undefined,
  outcomes: readonly TailReflowProgressOutcome[],
  failedBulletIds: ReadonlySet<string>,
): TailRepairProgressState {
  const outcomeById = new Map(outcomes.map((outcome) => [
    outcome.bulletId, outcome,
  ]));
  const byBulletId: Record<string, TailRepairBulletProgress> = {};
  for (const bulletId of failedBulletIds) {
    const prior = previous?.byBulletId[bulletId];
    const outcome = outcomeById.get(bulletId);
    if (!outcome) {
      if (prior) byBulletId[bulletId] = migrateTailProgress(prior);
      continue;
    }
    byBulletId[bulletId] = nextProgress(prior, outcome);
  }
  return {
    byBulletId,
    stalled: failedBulletIds.size > 0 && [...failedBulletIds].every(
      (bulletId) => isTailRepairExhausted(byBulletId[bulletId]),
    ),
  };
}

function nextProgress(
  prior: TailRepairBulletProgress | undefined,
  outcome: TailReflowProgressOutcome,
): TailRepairBulletProgress {
  const migrated = migrateTailProgress(prior ?? { consecutiveRejects: 0 });
  const { workingText, workingLineCount, workingLastLineRatio,
    workingLengthBudget, ...stable } = migrated;
  const retainedWorking = !outcome.applied
    ? workingFields(outcome, {
        workingText, workingLineCount, workingLastLineRatio,
        workingLengthBudget,
      })
    : {};
  return {
    ...stable,
    mode: "reflow",
    reflowAttempts: outcome.workingText ? 0 : outcome.applied
      ? migrated.reflowAttempts ?? 0
      : Math.min(MAX_TAIL_REFLOW_ATTEMPTS,
          (migrated.reflowAttempts ?? 0) + 1),
    ...(outcome.rejectedRewrite ? {
      rejectedReflowFingerprints: appendBounded(
        migrated.rejectedReflowFingerprints,
        outcome.rewriteFingerprint,
        MAX_REFLOW_HISTORY,
      ),
      rejectedReflows: appendBounded(
        migrated.rejectedReflows,
        outcome.rejectedRewrite,
        MAX_REFLOW_HISTORY,
      ),
    } : {}),
    ...retainedWorking,
  };
}

function workingFields(
  outcome: TailReflowProgressOutcome,
  prior: {
    workingText: string | undefined;
    workingLineCount: number | undefined;
    workingLastLineRatio: number | undefined;
    workingLengthBudget: TailLengthBudget | undefined;
  },
): Partial<TailRepairBulletProgress> {
  const text = outcome.workingText ?? prior.workingText;
  if (!text) return {};
  const lineCount = outcome.workingLineCount ?? prior.workingLineCount;
  const ratio = outcome.workingLastLineRatio ?? prior.workingLastLineRatio;
  const budget = outcome.workingLengthBudget ?? prior.workingLengthBudget;
  return {
    workingText: text,
    ...(lineCount === undefined ? {} : { workingLineCount: lineCount }),
    ...(ratio === undefined ? {} : { workingLastLineRatio: ratio }),
    ...(budget ? { workingLengthBudget: budget } : {}),
  };
}
