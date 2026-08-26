import type { ResumeBulletMeasurement } from "../compiler-types.js";
import type { ResumeTailPolicy } from "../tail-policy.js";

export interface TailLengthBudget {
  policyVersion: "resume-tail-v2";
  unit: "cjk_visual_unit";
  currentRatio: number;
  hardMinRatio: number;
  repairIdealRatio: number;
  availableLineWidthPx: number;
  currentTailWidthPx: number;
  ceuPx: number;
  separatorText: string;
  separatorWidthPx: number;
  hardDeficitPx: number;
  hardDeficitCjk: number;
  currentTextCjk: number;
  minimumFinalCjk: number;
  idealFinalCjk: number;
  maximumFinalCjk: number;
  compactIdealCjk: number;
  minimumGrowthCjk: number;
  idealGrowthCjk: number;
  maximumGrowthCjk: number;
  recommendedMode: "micro" | "phrase" | "clause" | "reflow";
  wrapRisk: "low" | "medium" | "high";
}

export function buildTailLengthBudget(
  measurement: ResumeBulletMeasurement,
  policy: ResumeTailPolicy,
): TailLengthBudget | undefined {
  if (
    policy.version !== "resume-tail-v2" ||
    !Number.isFinite(measurement.ceuPx) ||
    (measurement.ceuPx ?? 0) <= 0 ||
    !measurement.tailProbe
  ) return undefined;
  const width = measurement.availableLineWidthPx;
  const tail = measurement.lastLineWidthPx;
  const ceu = measurement.ceuPx ?? 0;
  const separator = measurement.tailProbe.separatorWidthPx;
  const hardDeficitPx = deficit(width, tail, policy.hardMinRatio);
  const minimumPx = Math.max(
    0,
    deficit(width, tail, policy.repairMinRatio) - separator,
  );
  const idealPx = Math.max(
    0,
    deficit(width, tail, policy.repairIdealRatio) - separator,
  );
  const maximumPx = Math.max(
    0,
    deficit(width, tail, policy.repairSoftMaxRatio) - separator,
  );
  const minimum = measurement.tailProbe.minCjk ?? ceilHalf(minimumPx / ceu);
  const ideal = measurement.tailProbe.idealCjk ?? roundHalf(idealPx / ceu);
  const maximum = Math.max(
    minimum,
    measurement.tailProbe.maxCjk ?? floorHalf(maximumPx / ceu),
  );
  const mode = recommendedMode(
    ideal,
    measurement.tailProbe.hardCjk,
    measurement.tailProbe.wrapRisk,
  );
  const lineCapacityCjk = width / ceu;
  const currentTextCjk = measurement.noWrapTextCjk &&
      measurement.noWrapTextCjk > 0
    ? measurement.noWrapTextCjk
    : (Math.max(1, measurement.lineCount) - 1) * lineCapacityCjk + tail / ceu;
  const rewriteMinimumFinalCjk = currentTextCjk + maximum;
  const sameLineCeilingCjk = Math.max(
    rewriteMinimumFinalCjk,
    Math.max(1, measurement.lineCount) * lineCapacityCjk - 1,
  );
  return {
    policyVersion: policy.version,
    unit: "cjk_visual_unit",
    currentRatio: measurement.lastLineRatio,
    hardMinRatio: policy.hardMinRatio,
    repairIdealRatio: policy.repairIdealRatio,
    availableLineWidthPx: width,
    currentTailWidthPx: tail,
    ceuPx: ceu,
    separatorText: measurement.tailProbe.separatorText,
    separatorWidthPx: separator,
    hardDeficitPx: round(hardDeficitPx),
    hardDeficitCjk: ceilHalf(Math.max(0, hardDeficitPx - separator) / ceu),
    currentTextCjk: roundHalf(currentTextCjk),
    minimumFinalCjk: roundHalf(rewriteMinimumFinalCjk),
    idealFinalCjk: roundHalf(Math.min(
      sameLineCeilingCjk,
      rewriteMinimumFinalCjk + 2,
    )),
    maximumFinalCjk: roundHalf(Math.min(
      sameLineCeilingCjk,
      rewriteMinimumFinalCjk + 4,
    )),
    compactIdealCjk: roundHalf(Math.max(
      policy.repairIdealRatio * lineCapacityCjk,
      (Math.max(1, measurement.lineCount) - 2 + policy.repairIdealRatio) *
        lineCapacityCjk,
    )),
    minimumGrowthCjk: minimum,
    idealGrowthCjk: ideal,
    maximumGrowthCjk: maximum,
    recommendedMode: mode,
    wrapRisk: measurement.tailProbe.wrapRisk,
  };
}

function recommendedMode(
  ideal: number,
  hardCjk: number | null,
  risk: TailLengthBudget["wrapRisk"],
): TailLengthBudget["recommendedMode"] {
  if (hardCjk === null || ideal > 16 || risk === "high") return "reflow";
  if (ideal <= 4) return "micro";
  if (ideal <= 10) return "phrase";
  return "clause";
}

function deficit(width: number, tail: number, ratio: number): number {
  return Math.max(0, width * ratio - tail);
}

function ceilHalf(value: number): number {
  return Math.ceil(value * 2) / 2;
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function floorHalf(value: number): number {
  return Math.floor(value * 2) / 2;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
