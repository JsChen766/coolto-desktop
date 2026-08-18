import type { ResumeCompiler } from "./compiler-port.js";
import type {
  RepairOption,
  RepairTarget,
} from "./tail-repair-input.js";
import type {
  TailRepairAttemptFeedback,
  TailRepairTargetFeedback,
} from "./tail-repair-feedback.js";
import {
  tailRepairOptionFingerprint,
  tailRepairLayoutFingerprint,
  type TailRepairAttemptRecord,
} from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";
import { minimumBulletLines } from "./bullet-depth-targets.js";

export async function measureTailRepairOptions(
  workspace: ResumeWorkspace,
  targets: readonly RepairTarget[],
  compiler: ResumeCompiler,
): Promise<{
  feedback: TailRepairTargetFeedback[];
  attemptRecords: TailRepairAttemptRecord[];
}> {
  const feedback = new Map(targets.map((target) => [
    target.bulletId,
    [] as TailRepairAttemptFeedback[],
  ]));
  const attemptRecords: TailRepairAttemptRecord[] = [];
  const ranks = Math.max(...targets.map((target) => target.options.length));
  for (let rank = 0; rank < ranks; rank += 1) {
    const chosen = new Map(targets.map((target) => [
      target.bulletId,
      target.options[Math.min(rank, target.options.length - 1)]!,
    ]));
    const result = await compiler.compile(structureWithOptions(workspace, chosen));
    for (const target of targets) {
      if (rank >= target.options.length) continue;
      const option = chosen.get(target.bulletId)!;
      const observed = result.bullets.find(
        (bullet) => bullet.bulletId === target.bulletId,
      );
      if (!observed) throw new Error(`bullet ${target.bulletId} 缺少候选测量`);
      const minimumLineCount = minimumBulletLines(workspace, target.bulletId);
      const withinLineLimit = observed.lineCount >= minimumLineCount &&
        observed.lineCount <= (workspace.maxBulletLines ?? 3);
      const attempt: TailRepairAttemptFeedback = {
        optionIndex: rank,
        kind: option.kind,
        characterCount: [...option.text].length,
        lineCount: observed.lineCount,
        lineDelta: observed.lineCount - target.currentLineCount,
        lastLineWidthPx: observed.lastLineWidthPx,
        availableLineWidthPx: observed.availableLineWidthPx,
        lastLineRatio: observed.lastLineRatio,
        tailWidthDeficitPx: Math.max(
          0,
          observed.availableLineWidthPx * 0.7 - observed.lastLineWidthPx,
        ),
        tailPassed: observed.passed,
        withinLineLimit,
        eligible: observed.passed && withinLineLimit,
      };
      feedback.get(target.bulletId)!.push(attempt);
      attemptRecords.push({
        bulletId: target.bulletId,
        sourceTextFingerprint: tailRepairOptionFingerprint(target.sourceText),
        baseTextFingerprint: tailRepairOptionFingerprint(target.currentText),
        layoutFingerprint: tailRepairLayoutFingerprint({
          templateId: result.templateId,
          profileHash: result.profileHash,
          viewportWidthPx: result.viewport.widthPx,
          devicePixelRatio: result.viewport.devicePixelRatio,
          bodyFontSizePx: result.bodyFontSizePx,
          availableLineWidthPx: observed.availableLineWidthPx,
          maxBulletLines: workspace.maxBulletLines ?? 3,
          minimumBulletLines: minimumLineCount,
        }),
        optionFingerprint: tailRepairOptionFingerprint(option.text),
        text: option.text,
        ...(option.baseText ? { baseText: option.baseText } : {}),
        ...(option.fragmentText ? { fragmentText: option.fragmentText } : {}),
        ...(option.requirementIds
          ? { requirementIds: option.requirementIds }
          : {}),
        ...attempt,
        minimumLineCount,
        lineDelta: observed.lineCount - target.sourceLineCount,
      });
    }
  }
  return {
    attemptRecords,
    feedback: targets.map((target) => ({
      bulletId: target.bulletId,
      role: target.role,
      attempts: feedback.get(target.bulletId)!,
    })),
  };
}

function structureWithOptions(
  workspace: ResumeWorkspace,
  options: ReadonlyMap<string, RepairOption>,
) {
  const structure = structuredClone(workspace.structure);
  for (const section of structure.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        bullet.text = options.get(bullet.id)?.text ?? bullet.text;
      }
    }
  }
  return structure;
}
