import type { RepairTarget } from "./tail-repair-input.js";
import type { MeasuredTailRepairOption } from "./tail-repair-plan.js";
import type { TailRepairAttemptRecord } from "./tail-repair-state.js";

/** Same-height improvements are safe to persist as the next formal baseline. */
export function improvingSameLineOptions(
  targets: readonly RepairTarget[],
  attempts: readonly TailRepairAttemptRecord[],
  alreadyRepaired: ReadonlySet<string>,
): MeasuredTailRepairOption[] {
  return targets.flatMap((target) => {
    if (alreadyRepaired.has(target.bulletId)) return [];
    const best = attempts.filter((attempt) =>
      attempt.bulletId === target.bulletId && isGrounded(attempt.kind) &&
      attempt.withinLineLimit && attempt.lineDelta === 0 &&
      !attempt.tailPassed && Boolean(attempt.text) &&
      hasMeaningfulProgress(
        target.currentLastLineRatio,
        attempt.lastLineRatio,
      )
    ).sort((left, right) => right.lastLineRatio - left.lastLineRatio)[0];
    if (!best?.text || !isGrounded(best.kind)) return [];
    return [{
      bulletId: best.bulletId,
      optionIndex: best.optionIndex ?? -1,
      text: best.text,
      kind: best.kind,
      addedLines: best.lineDelta,
      lastLineRatio: best.lastLineRatio,
    }];
  });
}

function hasMeaningfulProgress(current: number, candidate: number): boolean {
  const remaining = Math.max(0, 0.7 - current);
  const minimumGain = Math.min(0.2, Math.max(0.06, remaining * 0.4));
  return candidate >= current + minimumGain;
}

function isGrounded(
  value: string,
): value is "compact" | "grounded_rewrite" | "grounded_modifier" {
  return ["compact", "grounded_rewrite", "grounded_modifier"].includes(value);
}
