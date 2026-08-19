import { minimumBulletLines } from "./bullet-depth-targets.js";
import type { ResumeCompiler } from "./compiler-port.js";
import type { TailRepairSubmission } from "./tail-repair-input.js";
import type { ResumeWorkspace } from "./types.js";

const MINIMUM_RATIO_GAIN = 0.015;

export interface TailRepairMeasurement {
  characterCount: number;
  lineCount: number;
  lastLineWidthPx: number;
  availableLineWidthPx: number;
  lastLineRatio: number;
  tailPassed: boolean;
  pageCount: number;
  overflowPx: number;
}

export interface MeasuredTailRepair {
  submission: TailRepairSubmission;
  measurement: TailRepairMeasurement;
}

export type TailRepairMeasurementRejection = {
  kind: "line_count" | "insufficient_gain";
  reason: string;
};

export async function measureTailRepairBatch(
  workspace: ResumeWorkspace,
  submissions: readonly TailRepairSubmission[],
  compiler: ResumeCompiler,
): Promise<MeasuredTailRepair[]> {
  const byId = new Map(submissions.map((entry) => [
    entry.bulletId,
    entry.revisedText,
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
    return {
      submission,
      measurement: {
        characterCount: [...submission.revisedText].length,
        lineCount: observed.lineCount,
        lastLineWidthPx: observed.lastLineWidthPx,
        availableLineWidthPx: observed.availableLineWidthPx,
        lastLineRatio: observed.lastLineRatio,
        tailPassed: observed.passed,
        pageCount: result.pageCount,
        overflowPx: result.overflowPx,
      },
    };
  });
}

export function tailRepairMeasurementRejection(
  workspace: ResumeWorkspace,
  submission: TailRepairSubmission,
  measurement: TailRepairMeasurement,
): TailRepairMeasurementRejection | undefined {
  const minimum = minimumBulletLines(workspace, submission.bulletId);
  const maximum = workspace.maxBulletLines ?? 3;
  if (measurement.lineCount !== submission.currentLineCount) {
    return {
      kind: "line_count",
      reason: `尾行修复必须保持当前实测的 ${submission.currentLineCount} 行，不能改为 ${measurement.lineCount} 行`,
    };
  }
  if (measurement.lineCount < minimum || measurement.lineCount > maximum) {
    return {
      kind: "line_count",
      reason: `实测必须保持 ${minimum}–${maximum} 行`,
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
