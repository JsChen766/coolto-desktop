import { validateTailCandidateText } from "./tail-content-validation.js";
import {
  tailGrowthFingerprint,
  type TailGrowthFailureType,
  wasRejectedTailGrowth,
} from "./tail-repair-state.js";
import { tailRepairBatch } from "./tail-repair-targets.js";
import type { ResumeWorkspace } from "./types.js";

export interface TailGrowthInput {
  bulletId: string;
  growthText: string;
}

export interface TailGrowthSubmission {
  bulletId: string;
  currentText: string;
  currentLineCount: number;
  currentLastLineRatio: number;
  growthText: string;
  composedText: string;
  growthFingerprint: string;
}

export interface RejectedTailGrowthSubmission {
  bulletId: string;
  reason: string;
  growthFingerprint: string;
  rejectedGrowth: string;
  failureType: TailGrowthFailureType;
}

export function normalizeTailGrowthInputs(
  workspace: ResumeWorkspace,
  inputs: readonly TailGrowthInput[],
): {
  submissions: TailGrowthSubmission[];
  rejected: RejectedTailGrowthSubmission[];
} {
  const texts = currentBulletTexts(workspace);
  const measurements = new Map(
    workspace.compileResult.bullets.map((entry) => [entry.bulletId, entry]),
  );
  const targets = new Set(
    tailRepairBatch(workspace).targets.map((target) => target.bulletId),
  );
  const seenIds = new Set<string>();
  const seenGrowths = new Set<string>();
  const rejected: RejectedTailGrowthSubmission[] = [];
  const candidates: TailGrowthSubmission[] = [];

  for (const input of inputs) {
    const growthText = cleanGrowth(input.growthText);
    const growthFingerprint = tailGrowthFingerprint(growthText);
    try {
      if (seenIds.has(input.bulletId)) {
        throw new Error(`bullet ${input.bulletId} 在本批次中重复`);
      }
      seenIds.add(input.bulletId);
      const currentText = texts.get(input.bulletId);
      const observed = measurements.get(input.bulletId);
      if (!currentText || !observed) {
        throw new Error(`bullet ${input.bulletId} 缺少当前正式文本或测量`);
      }
      if (!targets.has(input.bulletId)) {
        throw new Error(`bullet ${input.bulletId} 不在当前尾行增长目标中`);
      }
      if (!growthText) {
        throw new Error(`bullet ${input.bulletId} growthText 不能为空`);
      }
      if (normalized(growthText).includes(normalized(currentText))) {
        throw new Error(
          `bullet ${input.bulletId} growthText 只能提交新增片段，不能重交完整 bullet`,
        );
      }
      if (seenGrowths.has(growthFingerprint)) {
        throw new Error(`bullet ${input.bulletId} 与本批其他增长片段重复`);
      }
      seenGrowths.add(growthFingerprint);
      if (wasRejectedTailGrowth(
        workspace.tailRepairProgress,
        input.bulletId,
        growthText,
      )) {
        throw new Error(
          `bullet ${input.bulletId} 的 growthText 已经被拒绝，请更换增长方向`,
        );
      }
      candidates.push({
        bulletId: input.bulletId,
        currentText,
        currentLineCount: observed.lineCount,
        currentLastLineRatio: observed.lastLineRatio,
        growthText,
        composedText: composeTailGrowth(
          currentText,
          growthText,
          workspace.structure.language,
        ),
        growthFingerprint,
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      rejected.push({
        bulletId: input.bulletId,
        reason,
        growthFingerprint,
        rejectedGrowth: growthText,
        failureType: duplicateFailure(reason) ? "duplicate" : "invalid_content",
      });
    }
  }

  const candidateTexts = new Map(candidates.map((entry) => [
    entry.bulletId,
    entry.composedText,
  ]));
  const submissions = candidates.filter((candidate) => {
    try {
      validateTailCandidateText(
        workspace,
        candidate.bulletId,
        candidate.composedText,
        candidateTexts,
      );
      return true;
    } catch (error: unknown) {
      rejected.push({
        bulletId: candidate.bulletId,
        reason: error instanceof Error ? error.message : String(error),
        growthFingerprint: candidate.growthFingerprint,
        rejectedGrowth: candidate.growthText,
        failureType: "invalid_content",
      });
      return false;
    }
  });
  return { submissions, rejected };
}

export function composeTailGrowth(
  currentText: string,
  growthText: string,
  language: string,
): string {
  const base = currentText.trim();
  const growth = cleanGrowth(growthText);
  const alreadyJoined = /[，,；;:]$/u.test(base);
  const separator = alreadyJoined ? "" : language === "en-US" ? "; " : "，";
  return `${base}${separator}${growth}`;
}

function currentBulletTexts(workspace: ResumeWorkspace): Map<string, string> {
  return new Map(workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
    ),
  ));
}

function cleanGrowth(value: string): string {
  return value.trim().replace(/^[，,；;。.!！?？:\s]+|[，,；;。.!！?？:\s]+$/gu, "");
}

function duplicateFailure(reason: string): boolean {
  return /重复|已经被拒绝|重交完整/u.test(reason);
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
