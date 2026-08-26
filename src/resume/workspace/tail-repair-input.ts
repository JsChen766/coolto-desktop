import { validateTailCandidateText } from "./tail-content-validation.js";
import {
  tailGrowthFingerprint,
  type TailGrowthFailureType,
  wasRejectedTailGrowth,
} from "./tail-repair-state.js";
import { tailRepairBatch } from "./tail-repair-targets.js";
import type { ResumeWorkspace } from "./types.js";
import { applyIncrementalText } from "./incremental-text-edit.js";
import {
  proposeFactNeutralFragment,
  withFactNeutralFragments,
} from "./fact-neutral-fragments.js";

export interface ComponentExpansionInput {
  bulletId: string;
  component: "context" | "method" | "action" | "result";
  placement: "prepend" | "after" | "append";
  anchor?: string;
  insertText: string;
  contentMode?: "fact_neutral";
}
export interface TailGrowthInput {
  bulletId: string;
  growthText: string;
  contentMode?: "fact_neutral";
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
      const composedText = composeTailGrowth(
        currentText,
        growthText,
        workspace.structure.language,
      );
      if (input.contentMode === "fact_neutral") {
        proposeFactNeutralFragment({
          workspace,
          bulletId: input.bulletId,
          appliedText: composedText,
          purpose: "tail_fill",
        });
      } else if (workspace.factNeutralAuthorization) {
        throw new Error(
          `bullet ${input.bulletId} 已进入无素材补齐阶段，必须显式传 contentMode=fact_neutral`,
        );
      }
      candidates.push({
        bulletId: input.bulletId,
        currentText,
        currentLineCount: observed.lineCount,
        currentLastLineRatio: observed.lastLineRatio,
        growthText,
        composedText,
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
      const neutral = inputs.find((input) => input.bulletId === candidate.bulletId)
        ?.contentMode === "fact_neutral";
      const validationWorkspace = neutral
        ? withFactNeutralFragments(workspace, [proposeFactNeutralFragment({
            workspace,
            bulletId: candidate.bulletId,
            appliedText: candidate.composedText,
            purpose: "tail_fill",
          })])
        : workspace;
      validateTailCandidateText(
        validationWorkspace,
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

/** Shared deterministic insertion used by the separate page-fill protocol. */
export function composeTailExpansion(
  currentText: string,
  input: ComponentExpansionInput,
  language: string,
): string {
  const insertText = input.insertText.trim();
  if (input.placement === "append") {
    return composeTailGrowth(currentText, insertText, language);
  }
  if (input.placement === "prepend") {
    const separator = language === "en-US" ? "; " : "，";
    return `${cleanGrowth(insertText)}${separator}${currentText.trim()}`;
  }
  return applyIncrementalText(currentText, {
    op: "insert_text",
    bulletId: input.bulletId,
    after: input.anchor?.trim() ?? "",
    text: insertText,
    evidenceIds: [],
  });
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
