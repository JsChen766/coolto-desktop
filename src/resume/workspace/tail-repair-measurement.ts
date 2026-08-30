import { RESUME_LAYOUT_TOLERANCE_PX } from "../compiler-types.js";
import { resolveTailPolicy } from "../tail-policy.js";
import type { ResumeCompiler } from "./compiler-port.js";
import type { TailGrowthSubmission } from "./tail-repair-input.js";
import type { TailAttemptFeedback } from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";

const MINIMUM_RATIO_GAIN = 0.015;

export interface TailRepairMeasurement {
  lineCount: number;
  lastLineWidthPx: number;
  availableLineWidthPx: number;
  lastLineRatio: number;
  tailPassed: boolean;
  pageCount: number;
  overflowPx: number;
  actualGrowthPx: number;
  actualGrowthCjk: number;
  remainingToHardCjk: number;
  remainingToIdealCjk: number;
  excessOverMaximumCjk: number;
}

export interface MeasuredTailRepair {
  submission: TailGrowthSubmission;
  measurement: TailRepairMeasurement;
}

export type TailRepairMeasurementRejection = {
  kind: "line_count" | "insufficient_gain";
  reason: string;
};

export async function measureTailRepairBatch(
  workspace: ResumeWorkspace,
  submissions: readonly TailGrowthSubmission[],
  compiler: ResumeCompiler,
): Promise<MeasuredTailRepair[]> {
  const byId = new Map(submissions.map((entry) => [
    entry.bulletId,
    entry.composedText,
  ]));
  const structure = structuredClone(workspace.structure);
  for (const section of structure.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        bullet.text = byId.get(bullet.id) ?? bullet.text;
      }
    }
  }
  const result = await compiler.compile(structure);
  return submissions.map((submission) => {
    const observed = result.bullets.find(
      (bullet) => bullet.bulletId === submission.bulletId,
    );
    if (!observed) {
      throw new Error(`bullet ${submission.bulletId} 缺少真实测量`);
    }
    const baseline = workspace.compileResult.bullets.find(
      (bullet) => bullet.bulletId === submission.bulletId,
    );
    if (!baseline) throw new Error(`bullet ${submission.bulletId} 缺少基线测量`);
    const policy = resolveTailPolicy(observed.tailPolicyVersion);
    const ceuPx = Math.max(
      observed.ceuPx ?? 0,
      baseline.ceuPx ?? 0,
      0.0001,
    );
    const actualGrowthPx = Math.max(
      0,
      (observed.noWrapTextWidthPx ?? 0) -
        (baseline.noWrapTextWidthPx ?? 0),
    );
    return {
      submission,
      measurement: {
        lineCount: observed.lineCount,
        lastLineWidthPx: observed.lastLineWidthPx,
        availableLineWidthPx: observed.availableLineWidthPx,
        lastLineRatio: observed.lastLineRatio,
        tailPassed: observed.passed,
        pageCount: result.pageCount,
        overflowPx: result.overflowPx,
        actualGrowthPx: round(actualGrowthPx),
        actualGrowthCjk: round(actualGrowthPx / ceuPx),
        remainingToHardCjk: round(deficitCjk(
          observed,
          policy.hardMinRatio,
          ceuPx,
        )),
        remainingToIdealCjk: round(deficitCjk(
          observed,
          policy.repairIdealRatio,
          ceuPx,
        )),
        excessOverMaximumCjk: round(Math.max(
          0,
          observed.lastLineWidthPx -
            observed.availableLineWidthPx * policy.repairSoftMaxRatio,
        ) / ceuPx),
      },
    };
  });
}

export function tailAttemptFeedback(
  rejection: TailRepairMeasurementRejection,
  measurement: TailRepairMeasurement,
): TailAttemptFeedback {
  const lineFailure = rejection.kind === "line_count";
  return {
    failureType: lineFailure
      ? "line_count_increased"
      : "insufficient_growth",
    actualGrowthCjk: measurement.actualGrowthCjk,
    remainingToHardCjk: measurement.remainingToHardCjk,
    remainingToIdealCjk: measurement.remainingToIdealCjk,
    excessOverMaximumCjk: measurement.excessOverMaximumCjk,
    requiredDirection: lineFailure
      ? measurement.excessOverMaximumCjk > 0 ? "decrease" : "reflow"
      : "increase",
  };
}

export function tailRepairMeasurementRejection(
  workspace: ResumeWorkspace,
  submission: TailGrowthSubmission,
  measurement: TailRepairMeasurement,
): TailRepairMeasurementRejection | undefined {
  const lockedLines = workspace.bulletLinePlans?.[submission.bulletId]
    ?.lockedLines ?? submission.currentLineCount;
  if (measurement.lineCount !== lockedLines) {
    return {
      kind: "line_count",
      reason: `尾行扩写必须保持锁定的 ${lockedLines} 行，不能改为 ${measurement.lineCount} 行`,
    };
  }
  if (
    measurement.pageCount !== 1 ||
    measurement.overflowPx > RESUME_LAYOUT_TOLERANCE_PX
  ) {
    return {
      kind: "line_count",
      reason: "尾行扩写后必须继续保持单页且不能溢出",
    };
  }
  if (measurement.tailPassed) return undefined;
  if (
    measurement.lastLineRatio <
      submission.currentLastLineRatio + MINIMUM_RATIO_GAIN
  ) {
    return {
      kind: "insufficient_gain",
      reason: `尾行占比未产生至少 ${
        Math.round(MINIMUM_RATIO_GAIN * 1000) / 10
      }% 的真实提升`,
    };
  }
  return undefined;
}

function deficitCjk(
  measurement: {
    availableLineWidthPx: number;
    lastLineWidthPx: number;
  },
  ratio: number,
  ceuPx: number,
): number {
  return Math.max(
    0,
    measurement.availableLineWidthPx * ratio - measurement.lastLineWidthPx,
  ) / ceuPx;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
