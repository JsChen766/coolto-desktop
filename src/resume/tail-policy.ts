export type ResumeTailPolicyVersion = "resume-tail-v1" | "resume-tail-v2";

export interface ResumeTailPolicy {
  version: ResumeTailPolicyVersion;
  hardMinRatio: number;
  repairMinRatio: number;
  repairIdealRatio: number;
  repairSoftMaxRatio: number;
  geometryTolerancePx: number;
  maxGrowthAttempts: number;
  legacyGlyphTolerance: boolean;
}

export const RESUME_TAIL_POLICY_V1: ResumeTailPolicy = {
  version: "resume-tail-v1",
  hardMinRatio: 0.7,
  repairMinRatio: 0.7,
  repairIdealRatio: 0.75,
  repairSoftMaxRatio: 0.82,
  geometryTolerancePx: 0,
  maxGrowthAttempts: 4,
  legacyGlyphTolerance: true,
};

export const RESUME_TAIL_POLICY_V2: ResumeTailPolicy = {
  version: "resume-tail-v2",
  hardMinRatio: 2 / 3,
  repairMinRatio: 0.7,
  repairIdealRatio: 0.74,
  repairSoftMaxRatio: 0.82,
  geometryTolerancePx: 1,
  maxGrowthAttempts: 2,
  legacyGlyphTolerance: false,
};

export function requireTailPolicy(
  version: ResumeTailPolicyVersion,
): ResumeTailPolicy {
  return version === "resume-tail-v1"
    ? RESUME_TAIL_POLICY_V1
    : RESUME_TAIL_POLICY_V2;
}

/** Missing means a persisted pre-V2 document and retains legacy behavior. */
export function resolveTailPolicy(
  version: ResumeTailPolicyVersion | undefined,
): ResumeTailPolicy {
  return requireTailPolicy(version ?? "resume-tail-v1");
}

export function passesTailPolicy(input: {
  lastLineWidthPx: number;
  availableLineWidthPx: number;
  policy: ResumeTailPolicy;
  fontSizePx?: number;
}): boolean {
  if (
    ![input.lastLineWidthPx, input.availableLineWidthPx].every(Number.isFinite) ||
    input.availableLineWidthPx <= 0
  ) return false;
  const fontSizePx = input.fontSizePx ?? 0;
  const tolerancePx = input.policy.legacyGlyphTolerance
    ? Math.max(0, Number.isFinite(fontSizePx) ? fontSizePx : 0)
    : input.policy.geometryTolerancePx;
  const requiredWidthPx =
    input.availableLineWidthPx * input.policy.hardMinRatio;
  return input.lastLineWidthPx + tolerancePx >= requiredWidthPx;
}
