import type { ResumeCompiler } from "./compiler-port.js";
import {
  normalizeTailRepairTargets,
  type TailRepairInput,
} from "./tail-repair-input.js";
import {
  chooseTailRepairPlan,
} from "./tail-repair-plan.js";
import {
  tailRepairFeedbackWarning,
  tailRepairLineDeltaBounds,
  type TailRepairAttemptFeedback,
  type TailRepairTargetFeedback,
} from "./tail-repair-feedback.js";
import {
  tailRepairOptionFingerprint,
  type TailRepairAttemptRecord,
} from "./tail-repair-state.js";
import {
  eligibleOptionsFromAttempts,
  mergeTailRepairAttempts,
  reusableTailRepairAttempts,
} from "./tail-repair-ledger.js";
import { measureTailRepairOptions } from "./tail-repair-measurement.js";
import { improvingSameLineOptions } from "./tail-repair-progress-options.js";
import type { ResumeWorkspace } from "./types.js";

export type { TailModifierInput, TailRepairInput } from "./tail-repair-input.js";
export type {
  TailRepairAttemptFeedback,
  TailRepairTargetFeedback,
} from "./tail-repair-feedback.js";

export interface SelectedAugmentedFragment {
  bulletId: string;
  baseText: string;
  fragmentText: string;
  appliedText: string;
  requirementIds: string[];
}

export interface TailRepairSelection {
  updates: Array<{ bulletId: string; text: string }>;
  augmentations: SelectedAugmentedFragment[];
  feedback: TailRepairTargetFeedback[];
  attemptRecords: TailRepairAttemptRecord[];
  allowedNetLineDelta: { minimum: number; maximum: number };
  diagnostics: TailRepairSelectionDiagnostics;
  writeRejectedReason?: string;
}

export interface TailRepairSelectionDiagnostics {
  requestedTargetCount: number;
  submittedCandidateCount: number;
  cachedCandidateCount: number;
  selectedCandidateCount: number;
  repairedTailCount: number;
  advancedCandidateCount: number;
  selectedFromCacheCount: number;
  retainedCandidateCount: number;
}

/** Agent authors every option; the host only measures and packs the page. */
export async function selectTailRepairPlan(
  workspace: ResumeWorkspace,
  inputs: readonly TailRepairInput[],
  compiler: ResumeCompiler,
): Promise<TailRepairSelection> {
  const normalized = normalizeTailRepairTargets(workspace, inputs);
  const measured = await measureTailRepairOptions(
    workspace,
    normalized.targets,
    compiler,
  );
  const cachedAttempts = reusableTailRepairAttempts(workspace);
  const attemptRecords = mergeTailRepairAttempts(
    cachedAttempts,
    measured.attemptRecords,
  );
  const eligible = eligibleOptionsFromAttempts(attemptRecords);
  const { minimum, maximum } = tailRepairLineDeltaBounds(workspace);
  const texts = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets),
  );
  const lengths = new Map(texts.map((bullet) => [
    bullet.id,
    [...bullet.text].length,
  ]));
  const failedIds = new Set(workspace.compileResult.bullets
    .filter((bullet) => !bullet.passed)
    .map((bullet) => bullet.bulletId));
  const candidateIds = [...new Set([
    ...failedIds,
    ...eligible.keys(),
  ])];
  const plan = chooseTailRepairPlan(
    candidateIds,
    eligible,
    minimum,
    maximum,
    lengths,
    failedIds,
  );
  const repairedOptions = plan?.options ?? [];
  const repairedById = new Map(repairedOptions.map((option) => [
    option.bulletId,
    option,
  ]));
  const advancedOptions = improvingSameLineOptions(
    normalized.targets,
    measured.attemptRecords,
    new Set(repairedById.keys()),
  );
  const selectedOptions = [...repairedOptions, ...advancedOptions];
  const selectedById = new Map(selectedOptions.map((option) => [
    option.bulletId,
    option,
  ]));
  const feedback = [...measured.feedback.map((target) => ({
    ...target,
    ...(selectedById.has(target.bulletId)
      ? selectedFeedback(
          target,
          selectedById.get(target.bulletId)!,
          measured.attemptRecords,
        )
      : {}),
  })), ...normalized.rejected.map((target) => ({
    bulletId: target.bulletId,
    role: target.role,
    rejectionReason: target.reason,
    attempts: [],
  }))];
  const unresolved = feedback.filter(
    (target) => target.role !== "page_balance" &&
      !repairedById.has(target.bulletId),
  );
  const diagnostics = selectionDiagnostics(
    inputs.length,
    measured.attemptRecords,
    cachedAttempts,
    selectedOptions,
    repairedOptions,
    advancedOptions.length,
    attemptRecords,
    failedIds,
  );
  if (!selectedOptions.length) {
    return {
      updates: [],
      augmentations: [],
      feedback,
      attemptRecords,
      allowedNetLineDelta: { minimum, maximum },
      diagnostics,
      writeRejectedReason: tailRepairFeedbackWarning(
        0, feedback.length, unresolved, minimum, maximum,
      ),
    };
  }
  return {
    updates: selectedOptions.map((option) => ({
      bulletId: option.bulletId,
      text: option.text,
    })),
    augmentations: repairedOptions.flatMap((option) =>
      option.kind === "augmented_modifier"
        ? [{
            bulletId: option.bulletId,
            baseText: option.baseText!,
            fragmentText: option.fragmentText!,
            appliedText: option.text,
            requirementIds: option.requirementIds ?? [],
          }]
        : [],
    ),
    feedback,
    attemptRecords,
    allowedNetLineDelta: { minimum, maximum },
    diagnostics,
    ...(unresolved.length
      ? { writeRejectedReason: tailRepairFeedbackWarning(
          plan?.repairedCount ?? 0,
          feedback.length,
          unresolved,
          minimum,
          maximum,
        ) }
      : {}),
  };
}

function selectionDiagnostics(
  requestedTargetCount: number,
  submitted: readonly TailRepairAttemptRecord[],
  cached: readonly TailRepairAttemptRecord[],
  selected: readonly { bulletId: string; text: string }[],
  repaired: readonly { bulletId: string }[],
  advancedCandidateCount: number,
  all: readonly TailRepairAttemptRecord[],
  failedIds: ReadonlySet<string>,
): TailRepairSelectionDiagnostics {
  const submittedKeys = new Set(submitted.map((attempt) =>
    `${attempt.bulletId}:${attempt.optionFingerprint}`
  ));
  const selectedIds = new Set(selected.map((option) => option.bulletId));
  return {
    requestedTargetCount,
    submittedCandidateCount: submitted.length,
    cachedCandidateCount: cached.length,
    selectedCandidateCount: selected.length,
    repairedTailCount: repaired.filter((option) =>
      failedIds.has(option.bulletId)
    ).length,
    advancedCandidateCount,
    selectedFromCacheCount: selected.filter((option) =>
      !submittedKeys.has(`${option.bulletId}:` +
        tailRepairOptionFingerprint(option.text))
    ).length,
    retainedCandidateCount: all.filter(
      (attempt) => !selectedIds.has(attempt.bulletId),
    ).length,
  };
}

function selectedFeedback(
  target: TailRepairTargetFeedback,
  selected: { text: string },
  measured: readonly TailRepairAttemptRecord[],
) {
  const fingerprint = tailRepairOptionFingerprint(selected.text);
  const current = measured.find(
    (attempt) => attempt.bulletId === target.bulletId &&
      attempt.optionFingerprint === fingerprint,
  );
  return current
    ? { selectedOptionIndex: current.optionIndex ?? -1 }
    : { selectedFromCache: true };
}
