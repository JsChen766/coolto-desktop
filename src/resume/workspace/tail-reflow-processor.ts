import { RESUME_LAYOUT_TOLERANCE_PX } from "../compiler-types.js";
import { validateTailCandidateText } from "./tail-content-validation.js";
import type { ResumeCompiler } from "./compiler-port.js";
import type { TailRepairFeedback } from "./tail-repair-processor.js";
import { updateTailReflowProgress, type TailReflowProgressOutcome } from
  "./tail-reflow-progress.js";
import { tailGrowthFingerprint } from "./tail-repair-state.js";
import { tailRepairBatch } from "./tail-repair-targets.js";
import type { ResumeWorkspace } from "./types.js";
import { tailReflowDeficitReason } from "./tail-reflow-feedback.js";
import { validateFactNeutralTailEdit } from "./fact-neutral-tail-validation.js";
import type { TailReflowBatchResult, TailReflowInput } from "./tail-reflow-types.js";
export type { TailReflowDiagnostics, TailReflowInput } from "./tail-reflow-types.js";

interface Candidate {
  bulletId: string;
  currentText: string;
  currentLineCount: number;
  revisedText: string;
  rewriteFingerprint: string;
}

export async function processTailReflowBatch(
  workspace: ResumeWorkspace,
  inputs: readonly TailReflowInput[],
  compiler: ResumeCompiler,
): Promise<TailReflowBatchResult> {
  const targets = new Map(tailRepairBatch(workspace).targets
    .filter((target) => target.mode === "reflow" && !target.exhausted)
    .map((target) => [target.bulletId, target]));
  const seen = new Set<string>();
  const feedback: TailRepairFeedback[] = [];
  const rejectedOutcomes: TailReflowProgressOutcome[] = [];
  const candidates: Candidate[] = [];

  for (const input of inputs) {
    const revisedText = input.revisedText.trim();
    const rewriteFingerprint = tailGrowthFingerprint(revisedText);
    try {
      if (seen.has(input.bulletId)) {
        throw new Error(`bullet ${input.bulletId} 在等价展开批次中重复`);
      }
      seen.add(input.bulletId);
      const target = targets.get(input.bulletId);
      if (!target) throw new Error(`bullet ${input.bulletId} 不在当前等价展开目标中`);
      if (!revisedText) throw new Error(`bullet ${input.bulletId} revisedText 不能为空`);
      if (!isOrderedExpansion(target.currentText, revisedText)) {
        throw new Error(
          `bullet ${input.bulletId} 必须完整保留 currentText 的原字符及顺序，只能插入修饰或结构表达`,
        );
      }
      const prior = workspace.tailRepairProgress?.byBulletId[input.bulletId];
      if (prior?.rejectedReflowFingerprints?.includes(rewriteFingerprint)) {
        throw new Error(`bullet ${input.bulletId} 的 revisedText 已被拒绝，请更换插入位置或表达`);
      }
      validateFactNeutralTailEdit(workspace, { ...input, appliedText: revisedText });
      candidates.push({
        bulletId: input.bulletId,
        currentText: target.currentText,
        currentLineCount: target.currentLineCount,
        revisedText,
        rewriteFingerprint,
      });
    } catch (error: unknown) {
      reject(input.bulletId, revisedText, rewriteFingerprint, error,
        feedback, rejectedOutcomes);
    }
  }

  const candidateTexts = new Map(candidates.map((candidate) => [
    candidate.bulletId,
    candidate.revisedText,
  ]));
  const validated = candidates.filter((candidate) => {
    try {
      const submitted = inputs.find((input) =>
        input.bulletId === candidate.bulletId
      );
      const validationWorkspace = validateFactNeutralTailEdit(workspace, {
        bulletId: candidate.bulletId,
        appliedText: candidate.revisedText,
        ...(submitted?.contentMode ? { contentMode: submitted.contentMode } : {}),
      });
      validateTailCandidateText(
        validationWorkspace,
        candidate.bulletId,
        candidate.revisedText,
        candidateTexts,
      );
      return true;
    } catch (error: unknown) {
      reject(candidate.bulletId, candidate.revisedText,
        candidate.rewriteFingerprint, error, feedback, rejectedOutcomes);
      return false;
    }
  });

  const compile = validated.length
    ? await compiler.compile(structureWithReflows(workspace, validated))
    : undefined;
  const updates: Array<{ bulletId: string; text: string }> = [];
  const outcomes = [...rejectedOutcomes];
  let lineRejected = 0;
  let tailRejected = 0;
  let pageRejected = 0;
  if (validated.length && !compile) {
    throw new Error("等价展开缺少真实批量测量");
  }
  for (const candidate of validated) {
    if (!compile) throw new Error("等价展开缺少真实批量测量");
    const observed = compile.bullets.find((bullet) =>
      bullet.bulletId === candidate.bulletId
    );
    if (!observed) throw new Error(`bullet ${candidate.bulletId} 缺少真实测量`);
    let reason: string | undefined;
    if (compile.pageCount !== 1 ||
      compile.overflowPx > RESUME_LAYOUT_TOLERANCE_PX) {
      pageRejected += 1;
      reason = "等价展开必须保持单页且不能产生溢出";
    } else if (observed.lineCount !== candidate.currentLineCount) {
      lineRejected += 1;
      reason = `等价展开必须保持当前实测的 ${candidate.currentLineCount} 行，不能改为 ${observed.lineCount} 行`;
    } else if (!observed.passed) {
      tailRejected += 1;
      reason = tailReflowDeficitReason(observed);
    }
    const applied = !reason;
    if (applied) updates.push({
      bulletId: candidate.bulletId,
      text: candidate.revisedText,
    });
    feedback.push({
      bulletId: candidate.bulletId,
      status: applied ? "applied" : "rejected",
      ...(reason ? { reason } : {}),
    });
    outcomes.push({
      bulletId: candidate.bulletId,
      applied,
      rewriteFingerprint: candidate.rewriteFingerprint,
      ...(reason ? { rejectedRewrite: candidate.revisedText } : {}),
    });
  }

  const failedIds = new Set(workspace.compileResult.bullets
    .filter((bullet) => !bullet.passed)
    .map((bullet) => bullet.bulletId));
  const progress = updateTailReflowProgress(
    workspace.tailRepairProgress,
    outcomes,
    failedIds,
  );
  const orderedFeedback = feedback.sort((left, right) =>
    inputs.findIndex((input) => input.bulletId === left.bulletId) -
      inputs.findIndex((input) => input.bulletId === right.bulletId)
  );
  const rejected = orderedFeedback.filter((entry) => entry.status === "rejected");
  return {
    updates,
    feedback: orderedFeedback,
    progress,
    diagnostics: {
      requestedTargetCount: inputs.length,
      measuredTargetCount: validated.length,
      appliedTargetCount: updates.length,
      passedTargetCount: updates.length,
      rejectedTargetCount: rejected.length,
      validationRejectedTargetCount: rejectedOutcomes.length,
      lineCountRejectedTargetCount: lineRejected,
      tailRejectedTargetCount: tailRejected,
      pageRejectedTargetCount: pageRejected,
    },
    ...(rejected.length
      ? { writeRejectedReason: rejected.map((entry) =>
          `${entry.bulletId}: ${entry.reason ?? "没有产生合格等价展开"}`
        ).join("；") }
      : {}),
  };
}

function isOrderedExpansion(currentText: string, revisedText: string): boolean {
  const current = normalizedCharacters(currentText);
  const revised = normalizedCharacters(revisedText);
  if (revised.length <= current.length) return false;
  let index = 0;
  for (const character of revised) {
    if (character === current[index]) index += 1;
  }
  return index === current.length;
}

function normalizedCharacters(value: string): string[] {
  return [...value.normalize("NFKC").replace(/\s+/gu, "")];
}

function structureWithReflows(
  workspace: ResumeWorkspace,
  candidates: readonly Candidate[],
) {
  const texts = new Map(candidates.map((candidate) => [
    candidate.bulletId,
    candidate.revisedText,
  ]));
  const structure = structuredClone(workspace.structure);
  for (const section of structure.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        bullet.text = texts.get(bullet.id) ?? bullet.text;
      }
    }
  }
  return structure;
}

function reject(
  bulletId: string,
  revisedText: string,
  rewriteFingerprint: string,
  error: unknown,
  feedback: TailRepairFeedback[],
  outcomes: TailReflowProgressOutcome[],
): void {
  const reason = error instanceof Error ? error.message : String(error);
  feedback.push({ bulletId, status: "rejected", reason });
  outcomes.push({
    bulletId,
    applied: false,
    rewriteFingerprint,
    rejectedRewrite: revisedText,
  });
}
