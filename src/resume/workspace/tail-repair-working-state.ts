import type { ResumeBulletMeasurement } from "../compiler-types.js";
import {
  tailRepairOptionFingerprint,
  type TailRepairAttemptRecord,
} from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";

export interface TailRepairWorkingState {
  text: string;
  characterCount: number;
  lineCount: number;
  lineDelta: number;
  lastLineWidthPx: number;
  availableLineWidthPx: number;
  lastLineRatio: number;
  tailPassed: boolean;
  withinLineLimit: boolean;
}

/**
 * Returns the closest validated edit measured for this bullet. Failed edits
 * may advance the private repair baseline, but never the persisted resume.
 */
export function tailRepairWorkingState(
  workspace: ResumeWorkspace,
  bulletId: string,
  sourceText: string,
  observed: ResumeBulletMeasurement,
): TailRepairWorkingState {
  const source: TailRepairWorkingState = {
    text: sourceText,
    characterCount: [...sourceText].length,
    lineCount: observed.lineCount,
    lineDelta: 0,
    lastLineWidthPx: observed.lastLineWidthPx,
    availableLineWidthPx: observed.availableLineWidthPx,
    lastLineRatio: observed.lastLineRatio,
    tailPassed: observed.passed,
    withinLineLimit: observed.lineCount <= (workspace.maxBulletLines ?? 3),
  };
  const sourceFingerprint = tailRepairOptionFingerprint(sourceText);
  const attempts = (workspace.tailRepairRetry?.attempts ?? []).filter(
    (attempt) =>
      attempt.bulletId === bulletId && attempt.text &&
      attempt.kind !== "augmented_modifier" &&
      attempt.sourceTextFingerprint === sourceFingerprint,
  );
  const best = attempts.map(fromAttempt).sort((left, right) =>
    workingScore(left) - workingScore(right) ||
    Math.abs(left.lineDelta) - Math.abs(right.lineDelta)
  )[0];
  return best && workingScore(best) < workingScore(source) ? best : source;
}

function fromAttempt(attempt: TailRepairAttemptRecord): TailRepairWorkingState {
  return {
    text: attempt.text!,
    characterCount: attempt.characterCount,
    lineCount: attempt.lineCount,
    lineDelta: attempt.lineDelta,
    lastLineWidthPx: attempt.lastLineWidthPx,
    availableLineWidthPx: attempt.availableLineWidthPx,
    lastLineRatio: attempt.lastLineRatio,
    tailPassed: attempt.tailPassed,
    withinLineLimit: attempt.withinLineLimit,
  };
}

function workingScore(state: TailRepairWorkingState): number {
  if (!state.withinLineLimit) return 100 + state.lineCount;
  if (state.tailPassed) return Math.abs(state.lineDelta) * 0.01;
  return Math.max(0, 0.73 - state.lastLineRatio) +
    Math.abs(state.lineDelta) * 0.05;
}
