import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import { resolveTailPolicy } from "../tail-policy.js";
import type { MeasuredSemanticTailCandidate } from
  "./semantic-tail-rewrite-measurement.js";

export function selectSemanticTailCandidates(
  measured: readonly MeasuredSemanticTailCandidate[],
): {
  selected: MeasuredSemanticTailCandidate[];
  rejected: Array<{ candidate: MeasuredSemanticTailCandidate; reason: string }>;
} {
  const rejected: Array<{
    candidate: MeasuredSemanticTailCandidate;
    reason: string;
  }> = [];
  const eligible = measured.filter((candidate) => {
    const reason = layoutRejection(candidate);
    if (reason) rejected.push({ candidate, reason });
    return !reason;
  });
  const byBullet = new Map<string, MeasuredSemanticTailCandidate[]>();
  for (const candidate of eligible) {
    const values = byBullet.get(candidate.bulletId) ?? [];
    values.push(candidate);
    byBullet.set(candidate.bulletId, values);
  }
  const selected = [...byBullet.values()].flatMap((values) =>
    [...values].sort(compareCandidate).slice(0, 1)
  );
  const reduced = selected.filter((candidate) =>
    candidate.lineCount < candidate.currentLineCount
  );
  if (reduced.length > 1) {
    const keep = [...reduced].sort(compareCandidate)[0];
    for (const candidate of reduced) {
      if (candidate === keep) continue;
      const replacement = byBullet.get(candidate.bulletId)?.filter((item) =>
        item.lineCount === item.currentLineCount
      ).sort(compareCandidate)[0];
      const index = selected.indexOf(candidate);
      if (replacement) selected[index] = replacement;
      else selected.splice(index, 1);
    }
  }
  return { selected, rejected };
}

function layoutRejection(
  candidate: MeasuredSemanticTailCandidate,
): string | undefined {
  if (
    candidate.pageCount !== 1 ||
    candidate.overflowPx > RESUME_LAYOUT_TOLERANCE_PX
  ) return "完整改写必须保持单页且不能产生 overflow";
  if (candidate.usageRatio < RESUME_GLOBAL_MINIMUM_USAGE_RATIO) {
    return "完整改写后页面占用率低于 92%";
  }
  if (candidate.lineCount < candidate.currentLineCount - 1) {
    return "完整改写不得一次减少两行以上";
  }
  if (!candidate.tailPassed) {
    return `完整改写尾行实测仅 ${(candidate.lastLineRatio * 100).toFixed(1)}%`;
  }
  return undefined;
}

function compareCandidate(
  left: MeasuredSemanticTailCandidate,
  right: MeasuredSemanticTailCandidate,
): number {
  const policy = resolveTailPolicy("resume-tail-v2");
  const leftLineChange = Math.abs(left.lineCount - left.currentLineCount);
  const rightLineChange = Math.abs(right.lineCount - right.currentLineCount);
  return leftLineChange - rightLineChange ||
    Math.abs(left.lastLineRatio - policy.repairIdealRatio) -
      Math.abs(right.lastLineRatio - policy.repairIdealRatio) ||
    Math.abs([...left.revisedText].length - [...left.currentText].length) -
      Math.abs([...right.revisedText].length - [...right.currentText].length) ||
    left.candidateIndex - right.candidateIndex;
}
