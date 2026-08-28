import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import type { ResumeCompiler } from "./compiler-port.js";
import {
  measureSemanticTailCandidates,
  measureSemanticTailSelection,
  type MeasuredSemanticTailCandidate,
  type PreparedSemanticTailCandidate,
} from "./semantic-tail-rewrite-measurement.js";
import { selectSemanticTailCandidates } from
  "./semantic-tail-rewrite-selector.js";
import type {
  SemanticTailRewriteBatchResult,
  SemanticTailRewriteFeedback,
  SemanticTailRewriteInput,
} from "./semantic-tail-rewrite-types.js";
import { validateSemanticTailRewrite } from
  "./semantic-tail-rewrite-validation.js";
import { bestWorkingCandidates } from
  "./semantic-tail-working-candidate.js";
import { resolveSemanticTailEvidence } from "./semantic-tail-evidence.js";
import { updateTailReflowProgress } from "./tail-reflow-progress.js";
import { tailGrowthFingerprint } from "./tail-repair-state.js";
import { tailRepairBatch } from "./tail-repair-targets.js";
import type { ResumeWorkspace } from "./types.js";
import {
  neutralTailValidationWorkspace,
  selectedNeutralTailFragments,
} from "./semantic-tail-neutral.js";
import {
  expandFactNeutralTailCandidates,
  semanticCandidateTextMaps,
} from "./semantic-tail-neutral-candidates.js";

export type { SemanticTailRewriteInput } from
  "./semantic-tail-rewrite-types.js";

export async function processSemanticTailRewriteBatch(
  workspace: ResumeWorkspace,
  inputs: readonly SemanticTailRewriteInput[],
  compiler: ResumeCompiler,
): Promise<SemanticTailRewriteBatchResult> {
  const targets = new Map(tailRepairBatch(workspace).targets
    .filter((target) => !target.exhausted)
    .map((target) => [target.bulletId, target]));
  const feedback: SemanticTailRewriteFeedback[] = [];
  const prepared: PreparedSemanticTailCandidate[] = [];
  const seenTargets = new Set<string>();
  let repetitionRejectedCandidateCount = 0;
  if (inputs.some((input) =>
    !input.candidates.length || input.candidates.length > 2
  )) throw new Error("每个 bullet 必须提交 1–2 份完整改写");
  const effectiveInputs = expandFactNeutralTailCandidates(
    workspace, inputs, targets,
  );
  const candidateMaps = semanticCandidateTextMaps(effectiveInputs);

  for (const input of effectiveInputs) {
    const target = targets.get(input.bulletId);
    if (seenTargets.has(input.bulletId)) {
      throw new Error(`bullet ${input.bulletId} 在语义尾行批次中重复`);
    }
    seenTargets.add(input.bulletId);
    if (!target) throw new Error(`bullet ${input.bulletId} 不在当前尾行目标中`);
    const seenTexts = new Set<string>();
    input.candidates.forEach((candidate, candidateIndex) => {
      const revisedText = candidate.revisedText.trim();
      try {
        const neutral = candidate.contentMode === "fact_neutral" ||
          candidate.contentMode === "fact_equivalent";
        const evidence = resolveSemanticTailEvidence({
          workspace,
          bulletId: input.bulletId,
          ...(candidate.additionalEvidenceIds
            ? { additionalEvidenceIds: candidate.additionalEvidenceIds }
            : {}),
        });
        const fingerprint = tailGrowthFingerprint(revisedText);
        if (seenTexts.has(fingerprint)) throw new Error("同一目标的候选文本重复");
        seenTexts.add(fingerprint);
        const rejected = workspace.tailRepairProgress?.byBulletId[input.bulletId]
          ?.rejectedReflowFingerprints ?? [];
        if (rejected.includes(fingerprint)) {
          throw new Error("该完整改写此前已经被拒绝");
        }
        const validationWorkspace = neutralTailValidationWorkspace(
          workspace, input.bulletId, revisedText, candidate,
        );
        validateSemanticTailRewrite({
          workspace: validationWorkspace,
          bulletId: input.bulletId,
          currentText: target.currentText,
          revisedText,
          otherCandidateTexts: candidateMaps[candidateIndex] ?? new Map(),
          sourceQuotes: evidence.sourceQuotes,
          evidenceIds: evidence.evidenceIds,
        });
        prepared.push({
          bulletId: input.bulletId,
          candidateIndex,
          strategy: candidate.strategy,
          currentText: target.currentText,
          currentLineCount: target.currentLineCount,
          revisedText,
          evidenceIds: evidence.evidenceIds,
          ...(neutral ? { contentMode: "fact_neutral" as const } : {}),
        });
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        if (/机械重复结尾/u.test(reason)) repetitionRejectedCandidateCount += 1;
        feedback.push({
          bulletId: input.bulletId,
          candidateIndex,
          strategy: candidate.strategy,
          status: "rejected",
          reason,
        });
      }
    });
  }

  const measured = prepared.length
    ? await measureSemanticTailCandidates(workspace, prepared, compiler)
    : [];
  const selection = selectSemanticTailCandidates(measured);
  for (const rejected of selection.rejected) {
    feedback.push({
      bulletId: rejected.candidate.bulletId,
      candidateIndex: rejected.candidate.candidateIndex,
      strategy: rejected.candidate.strategy,
      status: "rejected",
      reason: rejected.reason,
      lineCount: rejected.candidate.lineCount,
      lastLineRatio: rejected.candidate.lastLineRatio,
    });
  }
  const selected = await verifySelection(workspace, selection.selected, compiler);
  const updates = selected.map((candidate) => ({
    bulletId: candidate.bulletId,
    text: candidate.revisedText,
    evidenceIds: candidate.evidenceIds,
  }));
  const factNeutralFragments = selectedNeutralTailFragments(workspace, selected);
  for (const candidate of selected) {
    feedback.push({
      bulletId: candidate.bulletId,
      candidateIndex: candidate.candidateIndex,
      strategy: candidate.strategy,
      status: "applied",
      lineCount: candidate.lineCount,
      lastLineRatio: candidate.lastLineRatio,
    });
  }
  const selectedIds = new Set(selected.map((candidate) => candidate.bulletId));
  const workingById = bestWorkingCandidates(
    measured,
    selectedIds,
    targets,
  );
  const failedIds = new Set(workspace.compileResult.bullets
    .filter((bullet) => !bullet.passed)
    .map((bullet) => bullet.bulletId));
  const progress = updateTailReflowProgress(
    workspace.tailRepairProgress,
    inputs.map((input) => ({
      bulletId: input.bulletId,
      applied: selectedIds.has(input.bulletId),
      rewriteFingerprint: tailGrowthFingerprint(
        input.candidates.map((candidate) => candidate.revisedText).join("\n"),
      ),
      ...(!selectedIds.has(input.bulletId)
        ? {
          rejectedRewrite: input.candidates.at(-1)?.revisedText ?? "",
          ...(workingById.get(input.bulletId)
            ? {
              workingText: workingById.get(input.bulletId)!.revisedText,
              workingLineCount: workingById.get(input.bulletId)!.lineCount,
              workingLastLineRatio:
                workingById.get(input.bulletId)!.lastLineRatio,
              ...(workingById.get(input.bulletId)!.lengthBudget
                ? { workingLengthBudget:
                    workingById.get(input.bulletId)!.lengthBudget }
                : {}),
            }
            : {}),
        }
        : {}),
    })),
    failedIds,
  );
  const rejectedFeedback = feedback.filter((entry) =>
    entry.status === "rejected"
  );
  return {
    updates,
    feedback: feedback.sort(compareFeedback),
    progress,
    diagnostics: {
      requestedTargetCount: inputs.length,
      requestedCandidateCount: effectiveInputs.reduce(
        (total, input) => total + input.candidates.length,
        0,
      ),
      measuredCandidateCount: measured.length,
      appliedTargetCount: updates.length,
      validationRejectedCandidateCount: feedback.filter((entry) =>
        entry.status === "rejected" && entry.lineCount === undefined
      ).length,
      repetitionRejectedCandidateCount,
      layoutRejectedCandidateCount: selection.rejected.length,
    },
    ...(factNeutralFragments.length ? { factNeutralFragments } : {}),
    ...(rejectedFeedback.length
      ? { writeRejectedReason: rejectedFeedback.map((entry) =>
          `${entry.bulletId}[${entry.candidateIndex + 1}]: ${entry.reason}`
        ).join("；") }
      : {}),
  };
}

async function verifySelection(
  workspace: ResumeWorkspace,
  selected: readonly MeasuredSemanticTailCandidate[],
  compiler: ResumeCompiler,
): Promise<MeasuredSemanticTailCandidate[]> {
  if (!selected.length) return [];
  const compile = await measureSemanticTailSelection(workspace, selected, compiler);
  if (
    compile.pageCount !== 1 ||
    compile.overflowPx > RESUME_LAYOUT_TOLERANCE_PX ||
    compile.usageRatio < RESUME_GLOBAL_MINIMUM_USAGE_RATIO
  ) return [];
  return selected.filter((candidate) =>
    compile.bullets.find((bullet) => bullet.bulletId === candidate.bulletId)
      ?.passed === true
  );
}

function compareFeedback(
  left: SemanticTailRewriteFeedback,
  right: SemanticTailRewriteFeedback,
): number {
  return left.bulletId.localeCompare(right.bulletId) ||
    left.candidateIndex - right.candidateIndex ||
    Number(left.status === "applied") - Number(right.status === "applied");
}
