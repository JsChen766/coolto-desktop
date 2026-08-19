import { buildValidatedBullet } from "./agent-content-validation.js";
import { extractEvidenceNumbers } from "../evidence-numbers.js";
import {
  tailRepairTextFingerprint,
  wasLastRejectedTailText,
} from "./tail-repair-state.js";
import { tailRepairBatch } from "./tail-repair-targets.js";
import type { ResumeWorkspace } from "./types.js";

export interface TailRepairInput {
  bulletId: string;
  revisedText: string;
}

export interface TailRepairSubmission {
  bulletId: string;
  currentText: string;
  currentLineCount: number;
  currentLastLineRatio: number;
  revisedText: string;
  textFingerprint: string;
}

export interface RejectedTailRepairSubmission {
  bulletId: string;
  reason: string;
  textFingerprint: string;
}

export function normalizeTailRepairInputs(
  workspace: ResumeWorkspace,
  inputs: readonly TailRepairInput[],
): {
  submissions: TailRepairSubmission[];
  rejected: RejectedTailRepairSubmission[];
} {
  const texts = currentBulletTexts(workspace);
  const measurements = new Map(
    workspace.compileResult.bullets.map((entry) => [entry.bulletId, entry]),
  );
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const targets = new Map(tailRepairBatch(workspace).targets.map((target) => [
    target.bulletId,
    target,
  ]));
  const rejected: RejectedTailRepairSubmission[] = [];
  const submissions = inputs.flatMap((input) => {
    const revisedText = input.revisedText.trim();
    const textFingerprint = tailRepairTextFingerprint(revisedText);
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
      if (!revisedText) {
        throw new Error(`bullet ${input.bulletId} revisedText 不能为空`);
      }
      if (normalized(revisedText) === normalized(currentText)) {
        throw new Error(
          `bullet ${input.bulletId} revisedText 必须修改当前正式文本；当前与提交均为 ${[
            ...currentText,
          ].length} 字`,
        );
      }
      if ([...revisedText].length < [...currentText].length) {
        throw new Error(
          `bullet ${input.bulletId} 不能删减当前内容；请保留事实后自然重组或扩写`,
        );
      }
      const target = targets.get(input.bulletId);
      if (!target) {
        throw new Error(`bullet ${input.bulletId} 不在当前尾行修复目标中`);
      }
      assertPreservedNumbers(input.bulletId, currentText, revisedText);
      if (seenTexts.has(textFingerprint)) {
        throw new Error(`bullet ${input.bulletId} 与本批其他改写文本重复`);
      }
      seenTexts.add(textFingerprint);
      if (wasLastRejectedTailText(
        workspace.tailRepairProgress,
        input.bulletId,
        revisedText,
      )) {
        throw new Error(
          `bullet ${input.bulletId} 的 revisedText 已经提交过且没有进展，请基于当前正式文本重新修改`,
        );
      }
      validateBeforeMeasurement(workspace, input.bulletId, revisedText);
      return [{
        bulletId: input.bulletId,
        currentText,
        currentLineCount: observed.lineCount,
        currentLastLineRatio: observed.lastLineRatio,
        revisedText,
        textFingerprint,
      }];
    } catch (error: unknown) {
      rejected.push({
        bulletId: input.bulletId,
        reason: error instanceof Error ? error.message : String(error),
        textFingerprint,
      });
      return [];
    }
  });
  return { submissions, rejected };
}

function validateBeforeMeasurement(
  workspace: ResumeWorkspace,
  bulletId: string,
  text: string,
): void {
  const provenance = (workspace.bulletProvenance ?? []).find(
    (entry) => entry.bulletId === bulletId,
  );
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      const index = item.bullets.findIndex((bullet) => bullet.id === bulletId);
      if (index < 0 || !provenance) continue;
      const others = workspace.structure.sections.flatMap((candidateSection) =>
        candidateSection.items.flatMap((candidateItem) =>
          candidateItem.bullets.filter((bullet) => bullet.id !== bulletId)
        )
      );
      buildValidatedBullet({
        source: workspace,
        item,
        bullet: {
          bulletId,
          text,
          origin: provenance.origin,
          evidenceIds: provenance.evidenceIds,
          requirementIds: provenance.requirementIds,
        },
        index,
        retainedIds: new Set(others.map((bullet) => bullet.id)),
        retainedTexts: others.map((bullet) => normalized(bullet.text)),
      });
      return;
    }
  }
  throw new Error(`bullet ${bulletId} 缺少来源记录，不能修改`);
}

function assertPreservedNumbers(
  bulletId: string,
  currentText: string,
  revisedText: string,
): void {
  const revisedNumbers = new Set(extractEvidenceNumbers(revisedText));
  const missing = extractEvidenceNumbers(currentText).filter(
    (value) => !revisedNumbers.has(value),
  );
  if (missing.length) {
    throw new Error(
      `bullet ${bulletId} 的语义扩写必须保留原有数字：${[
        ...new Set(missing),
      ].join("、")}`,
    );
  }
}

function currentBulletTexts(workspace: ResumeWorkspace): Map<string, string> {
  return new Map(workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
    ),
  ));
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
