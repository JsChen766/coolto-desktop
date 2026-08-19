export const TAIL_REPAIR_STALL_ROUND = 3;

export interface TailRepairBulletProgress {
  zeroProgressRounds: number;
  appliedRounds?: number;
  attemptedRounds?: number;
  rejectedTextFingerprints?: string[];
  /** Legacy persisted field; read during migration and stop writing it. */
  lastRejectedTextFingerprint?: string;
}

export interface TailRepairProgressState {
  byBulletId: Record<string, TailRepairBulletProgress>;
  /** Unresolved bullets already tried in the current zero-progress sweep. */
  attemptedBulletIdsSinceProgress?: string[];
  zeroProgressRounds: number;
  stalled: boolean;
}

export interface TailRepairProgressOutcome {
  bulletId: string;
  applied: boolean;
  textFingerprint: string;
}

export function tailRepairTextFingerprint(text: string): string {
  const normalized = text.normalize("NFKC").trim();
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const character of normalized) {
    const value = character.codePointAt(0) ?? 0;
    left = Math.imul(left ^ value, 0x01000193);
    right = Math.imul(right ^ value, 0x85ebca6b);
  }
  return `${normalized.length}:${(left >>> 0).toString(16)}:${
    (right >>> 0).toString(16)
  }`;
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
      if (prior) byBulletId[bulletId] = prior;
      continue;
    }
    if (outcome.applied) {
      byBulletId[bulletId] = {
        zeroProgressRounds: 0,
        appliedRounds: (prior?.appliedRounds ?? 0) + 1,
        attemptedRounds: (prior?.attemptedRounds ?? 0) + 1,
      };
      continue;
    }
    const zeroProgressRounds = Math.min(
      TAIL_REPAIR_STALL_ROUND,
      (prior?.zeroProgressRounds ?? 0) + 1,
    );
    const rejectedTextFingerprints = appendRejectedFingerprint(
      prior,
      outcome.textFingerprint,
    );
    byBulletId[bulletId] = {
      zeroProgressRounds,
      ...(prior?.appliedRounds
        ? { appliedRounds: prior.appliedRounds }
        : {}),
      attemptedRounds: (prior?.attemptedRounds ?? 0) + 1,
      rejectedTextFingerprints,
    };
  }
  const madeFormalProgress = outcomes.some((outcome) => outcome.applied);
  const attempted = new Set(
    madeFormalProgress
      ? []
      : previous?.attemptedBulletIdsSinceProgress ?? [],
  );
  if (!madeFormalProgress) {
    outcomes.forEach((outcome) => attempted.add(outcome.bulletId));
  }
  const completedSweep = !madeFormalProgress &&
    [...failedBulletIds].every((bulletId) => attempted.has(bulletId));
  const zeroProgressRounds = madeFormalProgress
    ? 0
    : completedSweep
      ? Math.min(
          TAIL_REPAIR_STALL_ROUND,
          (previous?.zeroProgressRounds ?? 0) + 1,
        )
      : previous?.zeroProgressRounds ?? 0;
  if (completedSweep) attempted.clear();
  return {
    byBulletId,
    attemptedBulletIdsSinceProgress: [...attempted].filter((bulletId) =>
      failedBulletIds.has(bulletId)
    ).sort(),
    zeroProgressRounds,
    stalled: zeroProgressRounds >= TAIL_REPAIR_STALL_ROUND,
  };
}

export function wasLastRejectedTailText(
  state: TailRepairProgressState | undefined,
  bulletId: string,
  text: string,
): boolean {
  const progress = state?.byBulletId[bulletId];
  const fingerprint = tailRepairTextFingerprint(text);
  return progress?.lastRejectedTextFingerprint === fingerprint ||
    progress?.rejectedTextFingerprints?.includes(fingerprint) === true;
}

export function retainFailedTailProgress(
  state: TailRepairProgressState | undefined,
  failedBulletIds: ReadonlySet<string>,
): TailRepairProgressState | undefined {
  if (!state) return undefined;
  const byBulletId = Object.fromEntries(Object.entries(state.byBulletId).filter(
    ([bulletId]) => failedBulletIds.has(bulletId),
  ));
  if (!Object.keys(byBulletId).length) return undefined;
  return {
    byBulletId,
    attemptedBulletIdsSinceProgress: (
      state.attemptedBulletIdsSinceProgress ?? []
    ).filter((bulletId) => failedBulletIds.has(bulletId)),
    zeroProgressRounds: state.zeroProgressRounds ?? 0,
    stalled: (state.zeroProgressRounds ?? 0) >= TAIL_REPAIR_STALL_ROUND,
  };
}

function appendRejectedFingerprint(
  prior: TailRepairBulletProgress | undefined,
  fingerprint: string,
): string[] {
  const previous = [
    ...(prior?.rejectedTextFingerprints ?? []),
    ...(prior?.lastRejectedTextFingerprint
      ? [prior.lastRejectedTextFingerprint]
      : []),
  ].filter((value, index, values) => values.indexOf(value) === index);
  return [...previous.filter((value) => value !== fingerprint), fingerprint]
    .slice(-6);
}
