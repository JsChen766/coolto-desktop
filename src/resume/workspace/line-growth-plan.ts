export interface MeasuredLineGrowth {
  bulletId: string;
  text: string;
  addedLines: number;
  lastLineRatio: number;
  tailPassed: boolean;
}

export interface LineGrowthPlan {
  rewrites: MeasuredLineGrowth[];
  addedLines: number;
  tailScore: number;
  tailFailureCount: number;
}

export function chooseLineGrowthPlan(
  rewrites: readonly MeasuredLineGrowth[],
  targetLines: number,
  capacityLines: number,
): LineGrowthPlan | undefined {
  let best: LineGrowthPlan | undefined;
  const visit = (index: number, plan: LineGrowthPlan): void => {
    if (plan.addedLines > capacityLines) return;
    if (index === rewrites.length) {
      if (plan.addedLines > 0 && isBetter(plan, best, targetLines)) best = plan;
      return;
    }
    visit(index + 1, plan);
    const rewrite = rewrites[index]!;
    visit(index + 1, {
      rewrites: [...plan.rewrites, rewrite],
      addedLines: plan.addedLines + rewrite.addedLines,
      tailScore: plan.tailScore + Math.min(0.7, rewrite.lastLineRatio),
      tailFailureCount: plan.tailFailureCount + (rewrite.tailPassed ? 0 : 1),
    });
  };
  visit(0, { rewrites: [], addedLines: 0, tailScore: 0, tailFailureCount: 0 });
  return best;
}

function isBetter(
  candidate: LineGrowthPlan,
  current: LineGrowthPlan | undefined,
  targetLines: number,
): boolean {
  if (!current) return true;
  const candidateReached = candidate.addedLines >= targetLines;
  const currentReached = current.addedLines >= targetLines;
  if (candidateReached !== currentReached) return candidateReached;
  if (candidate.addedLines !== current.addedLines) {
    return candidateReached
      ? candidate.addedLines < current.addedLines
      : candidate.addedLines > current.addedLines;
  }
  if (candidate.tailFailureCount !== current.tailFailureCount) {
    return candidate.tailFailureCount < current.tailFailureCount;
  }
  if (candidate.rewrites.length !== current.rewrites.length) {
    return candidate.rewrites.length < current.rewrites.length;
  }
  return candidate.tailScore > current.tailScore;
}
