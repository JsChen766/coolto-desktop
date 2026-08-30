import type { ResumeBulletMeasurement } from "../compiler-types.js";
import { resolveTailPolicy } from "../tail-policy.js";

export function tailReflowDeficitReason(
  observed: ResumeBulletMeasurement,
): string {
  const policy = resolveTailPolicy(observed.tailPolicyVersion);
  const remainingPx = Math.max(0,
    observed.availableLineWidthPx * policy.hardMinRatio -
      observed.lastLineWidthPx);
  if (!observed.ceuPx) return "等价展开后的尾行仍未达到正式门槛";
  const remainingCjk = Number((remainingPx / observed.ceuPx).toFixed(1));
  return `等价展开后的尾行仍未达到正式门槛，实测还差约 ${remainingCjk} CEU`;
}
