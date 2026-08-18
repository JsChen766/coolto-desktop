export type TailRepairOptionKind =
  | "compact"
  | "grounded_rewrite"
  | "grounded_modifier"
  | "augmented_modifier";

export interface MeasuredTailRepairOption {
  bulletId: string;
  optionIndex: number;
  text: string;
  kind: TailRepairOptionKind;
  addedLines: number;
  lastLineRatio: number;
  baseText?: string;
  fragmentText?: string;
  requirementIds?: string[];
}

export interface TailRepairPlan {
  options: MeasuredTailRepairOption[];
  repairedCount: number;
  totalLineDelta: number;
  augmentedCount: number;
  compactCount: number;
  balanceCount: number;
  editCost: number;
  tailScore: number;
}

export function chooseTailRepairPlan(
  bulletIds: readonly string[],
  options: ReadonlyMap<string, readonly MeasuredTailRepairOption[]>,
  minimumLineDelta: number,
  maximumLineDelta: number,
  currentLengths: ReadonlyMap<string, number>,
  failedBulletIds: ReadonlySet<string> = new Set(bulletIds),
): TailRepairPlan | undefined {
  let states = new Map<number, TailRepairPlan>([[0, emptyPlan()]]);
  for (const bulletId of bulletIds) {
    const next = new Map(states);
    for (const plan of states.values()) {
      for (const option of options.get(bulletId) ?? []) {
      const currentLength = currentLengths.get(bulletId) ?? 0;
        const candidate = {
        options: [...plan.options, option],
          repairedCount: plan.repairedCount +
            (failedBulletIds.has(bulletId) ? 1 : 0),
        totalLineDelta: plan.totalLineDelta + option.addedLines,
        augmentedCount: plan.augmentedCount +
          (option.kind === "augmented_modifier" ? 1 : 0),
        compactCount: plan.compactCount + (option.kind === "compact" ? 1 : 0),
          balanceCount: plan.balanceCount +
            (failedBulletIds.has(bulletId) ? 0 : 1),
        editCost: plan.editCost + Math.abs([...option.text].length - currentLength),
        tailScore: plan.tailScore + Math.min(0.7, option.lastLineRatio),
        };
        const existing = next.get(candidate.totalLineDelta);
        if (isBetter(candidate, existing)) {
          next.set(candidate.totalLineDelta, candidate);
        }
      }
    }
    states = next;
  }
  let best: TailRepairPlan | undefined;
  for (const plan of states.values()) {
    if (
      plan.repairedCount > 0 &&
      plan.totalLineDelta >= minimumLineDelta &&
      plan.totalLineDelta <= maximumLineDelta &&
      isBetter(plan, best)
    ) best = plan;
  }
  return best;
}

function isBetter(
  candidate: TailRepairPlan,
  current: TailRepairPlan | undefined,
): boolean {
  if (!current) return true;
  if (candidate.repairedCount !== current.repairedCount) {
    return candidate.repairedCount > current.repairedCount;
  }
  if (candidate.augmentedCount !== current.augmentedCount) {
    return candidate.augmentedCount < current.augmentedCount;
  }
  if (candidate.balanceCount !== current.balanceCount) {
    return candidate.balanceCount < current.balanceCount;
  }
  if (Math.abs(candidate.totalLineDelta) !== Math.abs(current.totalLineDelta)) {
    return Math.abs(candidate.totalLineDelta) < Math.abs(current.totalLineDelta);
  }
  if (candidate.compactCount !== current.compactCount) {
    return candidate.compactCount < current.compactCount;
  }
  if (candidate.editCost !== current.editCost) {
    return candidate.editCost < current.editCost;
  }
  return candidate.tailScore > current.tailScore;
}

function emptyPlan(): TailRepairPlan {
  return {
    options: [],
    repairedCount: 0,
    totalLineDelta: 0,
    augmentedCount: 0,
    compactCount: 0,
    balanceCount: 0,
    editCost: 0,
    tailScore: 0,
  };
}
