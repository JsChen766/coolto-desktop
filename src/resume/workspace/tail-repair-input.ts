import { extractEvidenceNumbers } from "../evidence-numbers.js";
import { buildValidatedBullet } from "./agent-content-validation.js";
import type { TailRepairOptionKind } from "./tail-repair-plan.js";
import { tailRepairOptionFingerprint } from "./tail-repair-state.js";
import { tailRepairWorkingState } from "./tail-repair-working-state.js";
import type { ResumeWorkspace } from "./types.js";

export interface TailModifierInput {
  text: string;
  requirementIds?: readonly string[];
}

export interface TailRepairInput {
  bulletId: string;
  revisedText?: string;
  augmentedModifier?: TailModifierInput;
}

export interface RepairOption {
  bulletId: string;
  text: string;
  kind: TailRepairOptionKind;
  baseText?: string;
  fragmentText?: string;
  requirementIds?: string[];
}

export interface RepairTarget {
  bulletId: string;
  sourceText: string;
  sourceLineCount: number;
  currentText: string;
  currentLineCount: number;
  currentLastLineRatio: number;
  role: "repair" | "page_balance";
  options: RepairOption[];
}

export interface RejectedRepairTarget {
  bulletId: string;
  role: "repair" | "page_balance";
  reason: string;
}

export interface NormalizedTailRepairTargets {
  targets: RepairTarget[];
  rejected: RejectedRepairTarget[];
}

export function normalizeTailRepairTargets(
  workspace: ResumeWorkspace,
  inputs: readonly TailRepairInput[],
): NormalizedTailRepairTargets {
  const texts = currentBulletTexts(workspace);
  const measurements = new Map(
    workspace.compileResult.bullets.map((entry) => [entry.bulletId, entry]),
  );
  const requirements = new Set(
    workspace.sourceSnapshot.jd.requirements.map((entry) => entry.id),
  );
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const rejected: RejectedRepairTarget[] = [];
  const targets = inputs.flatMap((input) => {
    const observed = measurements.get(input.bulletId);
    const role = observed?.passed ? "page_balance" as const : "repair" as const;
    try {
      if (seenIds.has(input.bulletId)) throw new Error(`bullet ${input.bulletId} 重复`);
      seenIds.add(input.bulletId);
      const sourceText = texts.get(input.bulletId);
      if (!sourceText || !observed) {
        throw new Error(`bullet ${input.bulletId} 缺少当前文本或测量`);
      }
      const working = tailRepairWorkingState(
        workspace,
        input.bulletId,
        sourceText,
        observed,
      );
      const hasRevision = Boolean(input.revisedText?.trim());
      const hasAugmentation = Boolean(input.augmentedModifier?.text.trim());
      if (hasRevision === hasAugmentation) {
        throw new Error(
          `bullet ${input.bulletId} 必须且只能提供 revisedText 或 augmentedModifier`,
        );
      }
      const option = hasRevision
        ? revisedOption(input.bulletId, working.text, input.revisedText!)
        : augmentedOption(
            input.bulletId,
            working.text,
            input.augmentedModifier!,
            requirements,
          );
      if (normalized(option.text) === normalized(working.text)) return [];
      const fingerprint = tailRepairOptionFingerprint(option.text);
      if (seenTexts.has(fingerprint)) {
        throw new Error(`bullet ${input.bulletId} 与本批其他修订文本重复`);
      }
      seenTexts.add(fingerprint);
      const attempted = new Set((workspace.tailRepairRetry?.attempts ?? [])
        .filter((attempt) => attempt.bulletId === input.bulletId)
        .map((attempt) => attempt.optionFingerprint));
      if (attempted.has(fingerprint)) {
        throw new Error(
          `bullet ${input.bulletId} 的修订文本已经实测，请基于当前文本继续修改`,
        );
      }
      validateBeforeMeasurement(workspace, input.bulletId, option.text);
      return [{
        bulletId: input.bulletId,
        sourceText,
        sourceLineCount: observed.lineCount,
        currentText: working.text,
        currentLineCount: working.lineCount,
        currentLastLineRatio: working.lastLineRatio,
        role,
        options: [option],
      }];
    } catch (error: unknown) {
      rejected.push({
        bulletId: input.bulletId,
        role,
        reason: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });
  return { targets, rejected };
}

function revisedOption(
  bulletId: string,
  currentText: string,
  rawText: string,
): RepairOption {
  const text = rawText.trim();
  return {
    bulletId,
    text,
    kind: [...text].length < [...currentText].length
      ? "compact"
      : "grounded_rewrite",
  };
}

function augmentedOption(
  bulletId: string,
  currentText: string,
  modifier: TailModifierInput,
  requirements: ReadonlySet<string>,
): RepairOption {
  const fragmentText = modifier.text.trim();
  const ids = [...new Set(modifier.requirementIds ?? [])];
  if (!ids.length || ids.some((id) => !requirements.has(id))) {
    throw new Error(`bullet ${bulletId} augmentedModifier 必须引用当前 JD requirementIds`);
  }
  if (extractEvidenceNumbers(fragmentText).length ||
    fragmentText.toLocaleLowerCase().includes("xx")) {
    throw new Error(`bullet ${bulletId} augmentedModifier 不得新增数字或 XX`);
  }
  return {
    bulletId,
    text: `${currentText}${fragmentText}`,
    kind: "augmented_modifier",
    baseText: currentText,
    fragmentText,
    requirementIds: ids,
  };
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
  throw new Error(`bullet ${bulletId} 缺少来源记录，不能修订`);
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
