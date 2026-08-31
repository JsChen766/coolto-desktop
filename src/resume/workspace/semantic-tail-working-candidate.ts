import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import type { MeasuredSemanticTailCandidate } from
  "./semantic-tail-rewrite-measurement.js";

interface WorkingTarget {
  currentLineCount: number;
  currentLastLineRatio: number;
  lengthBudget?: { currentRatio: number };
}

export function bestWorkingCandidates(
  measured: readonly MeasuredSemanticTailCandidate[],
  selectedIds: ReadonlySet<string>,
  targets: ReadonlyMap<string, WorkingTarget>,
): Map<string, MeasuredSemanticTailCandidate> {
  const result = new Map<string, MeasuredSemanticTailCandidate>();
  for (const candidate of measured) {
    const target = targets.get(candidate.bulletId);
    const baseline = target?.lengthBudget?.currentRatio ??
      target?.currentLastLineRatio ?? 0;
    if (!target || selectedIds.has(candidate.bulletId) ||
      candidate.pageCount !== 1 ||
      candidate.overflowPx > RESUME_LAYOUT_TOLERANCE_PX ||
      candidate.usageRatio < RESUME_GLOBAL_MINIMUM_USAGE_RATIO ||
      candidate.lineCount !== target.currentLineCount ||
      candidate.lastLineRatio < baseline + 0.015) continue;
    const prior = result.get(candidate.bulletId);
    if (!prior || candidate.lastLineRatio > prior.lastLineRatio) {
      result.set(candidate.bulletId, candidate);
    }
  }
  return result;
}
