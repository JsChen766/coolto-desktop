import type { ResumeCompiler } from "./compiler-port.js";
import {
  normalizeTailRepairInputs,
  type TailRepairInput,
} from "./tail-repair-input.js";
import {
  updateTailRepairProgress,
  type TailRepairProgressOutcome,
  type TailRepairProgressState,
} from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";
import {
  measureTailRepairBatch,
  tailRepairMeasurementRejection,
  type TailRepairMeasurement,
} from "./tail-repair-measurement.js";
import {
  tailRepairValidationReasonCounts,
  type TailRepairValidationReasonCounts,
} from "./tail-repair-rejection-diagnostics.js";

export type { TailRepairInput } from "./tail-repair-input.js";
export type { TailRepairMeasurement } from "./tail-repair-measurement.js";

export interface TailRepairFeedback {
  bulletId: string;
  status: "applied" | "rejected";
  reason?: string;
  measurement?: TailRepairMeasurement;
}

export interface TailRepairDiagnostics {
  requestedTargetCount: number;
  measuredTargetCount: number;
  appliedTargetCount: number;
  passedTargetCount: number;
  progressedTargetCount: number;
  rejectedTargetCount: number;
  validationRejectedTargetCount: number;
  lineCountRejectedTargetCount: number;
  insufficientGainRejectedTargetCount: number;
  validationReasonCounts: TailRepairValidationReasonCounts;
}

export interface TailRepairBatchResult {
  updates: Array<{ bulletId: string; text: string }>;
  feedback: TailRepairFeedback[];
  progress: TailRepairProgressState;
  diagnostics: TailRepairDiagnostics;
  writeRejectedReason?: string;
}

export async function processTailRepairBatch(
  workspace: ResumeWorkspace,
  inputs: readonly TailRepairInput[],
  compiler: ResumeCompiler,
): Promise<TailRepairBatchResult> {
  const normalized = normalizeTailRepairInputs(workspace, inputs);
  const measured = normalized.submissions.length
    ? await measureTailRepairBatch(workspace, normalized.submissions, compiler)
    : [];
  const feedback: TailRepairFeedback[] = normalized.rejected.map((entry) => ({
    bulletId: entry.bulletId,
    status: "rejected",
    reason: entry.reason,
  }));
  const updates: Array<{ bulletId: string; text: string }> = [];
  const outcomes: TailRepairProgressOutcome[] = normalized.rejected.map((entry) => ({
    bulletId: entry.bulletId,
    applied: false,
    textFingerprint: entry.textFingerprint,
  }));
  let passedTargetCount = 0;
  let progressedTargetCount = 0;
  let lineCountRejectedTargetCount = 0;
  let insufficientGainRejectedTargetCount = 0;
  const evaluated = measured.map((entry) => ({
    entry,
    rejection: tailRepairMeasurementRejection(
      workspace,
      entry.submission,
      entry.measurement,
    ),
  }));
  for (const { entry, rejection: measuredRejection } of evaluated) {
    const rejection = measuredRejection;
    const applied = !rejection;
    if (applied) {
      updates.push({
        bulletId: entry.submission.bulletId,
        text: entry.submission.revisedText,
      });
      if (entry.measurement.tailPassed) passedTargetCount += 1;
      else progressedTargetCount += 1;
    } else if (rejection.kind === "line_count") {
      lineCountRejectedTargetCount += 1;
    } else {
      insufficientGainRejectedTargetCount += 1;
    }
    feedback.push({
      bulletId: entry.submission.bulletId,
      status: applied ? "applied" : "rejected",
      ...(rejection ? { reason: rejection.reason } : {}),
      measurement: entry.measurement,
    });
    outcomes.push({
      bulletId: entry.submission.bulletId,
      applied,
      textFingerprint: entry.submission.textFingerprint,
    });
  }
  const failedIds = new Set(workspace.compileResult.bullets
    .filter((bullet) => !bullet.passed)
    .map((bullet) => bullet.bulletId));
  const progress = updateTailRepairProgress(
    workspace.tailRepairProgress,
    outcomes,
    failedIds,
  );
  const diagnostics: TailRepairDiagnostics = {
    requestedTargetCount: inputs.length,
    measuredTargetCount: measured.length,
    appliedTargetCount: updates.length,
    passedTargetCount,
    progressedTargetCount,
    rejectedTargetCount: feedback.length - updates.length,
    validationRejectedTargetCount: normalized.rejected.length,
    lineCountRejectedTargetCount,
    insufficientGainRejectedTargetCount,
    validationReasonCounts: tailRepairValidationReasonCounts(
      normalized.rejected.map((entry) => entry.reason),
    ),
  };
  const rejected = feedback.filter((entry) => entry.status === "rejected");
  return {
    updates,
    feedback: feedback.sort((left, right) =>
      inputs.findIndex((entry) => entry.bulletId === left.bulletId) -
        inputs.findIndex((entry) => entry.bulletId === right.bulletId)
    ),
    progress,
    diagnostics,
    ...(rejected.length
      ? { writeRejectedReason: rejected.map((entry) =>
          `${entry.bulletId}: ${entry.reason ?? "没有产生真实尾行进展"}`
        ).join("；") }
      : {}),
  };
}
