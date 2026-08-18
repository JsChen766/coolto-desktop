import type { MeasuredTailRepairOption } from "./tail-repair-plan.js";
import {
  buildTailRepairRetryState,
  tailRepairLayoutFingerprint,
  tailRepairOptionFingerprint,
  type TailRepairAttemptRecord,
  type TailRepairRetryState,
} from "./tail-repair-state.js";
import { tailRepairLineDeltaBounds } from "./tail-repair-feedback.js";
import type { ResumeWorkspace } from "./types.js";
import { minimumBulletLines } from "./bullet-depth-targets.js";

export function reusableTailRepairAttempts(
  workspace: ResumeWorkspace,
  records: readonly TailRepairAttemptRecord[] =
    workspace.tailRepairRetry?.attempts ?? [],
): TailRepairAttemptRecord[] {
  const sourceFingerprints = new Map(
    workspace.structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets.map((bullet) => [
        bullet.id,
        tailRepairOptionFingerprint(bullet.text),
      ] as const)),
    ),
  );
  const measurements = new Map(
    workspace.compileResult.bullets.map((bullet) => [bullet.bulletId, bullet]),
  );
  return records.filter((record) =>
    Boolean(record.text) && record.sourceTextFingerprint ===
      sourceFingerprints.get(record.bulletId) && record.layoutFingerprint ===
      currentLayoutFingerprint(workspace, measurements.get(record.bulletId))
  );
}

export function mergeTailRepairAttempts(
  previous: readonly TailRepairAttemptRecord[],
  current: readonly TailRepairAttemptRecord[],
): TailRepairAttemptRecord[] {
  return [...new Map([...previous, ...current].map((record) => [
    `${record.bulletId}:${record.sourceTextFingerprint}:` +
      record.optionFingerprint,
    record,
  ])).values()].slice(-256);
}

export function tailRepairRetryForWorkspace(
  workspace: ResumeWorkspace,
  records: readonly TailRepairAttemptRecord[],
): TailRepairRetryState | undefined {
  const retained = reusableTailRepairAttempts(workspace, records);
  const failedIds = new Set(workspace.compileResult.bullets
    .filter((bullet) => !bullet.passed)
    .map((bullet) => bullet.bulletId));
  return retained.length && failedIds.size
    ? buildTailRepairRetryState(
        undefined,
        retained,
        tailRepairLineDeltaBounds(workspace),
        failedIds,
      )
    : undefined;
}

export function eligibleOptionsFromAttempts(
  attempts: readonly TailRepairAttemptRecord[],
): Map<string, MeasuredTailRepairOption[]> {
  const options = new Map<string, MeasuredTailRepairOption[]>();
  for (const attempt of attempts) {
    if (!attempt.eligible || !attempt.text || !isOptionKind(attempt.kind)) continue;
    const entries = options.get(attempt.bulletId) ?? [];
    entries.push({
      bulletId: attempt.bulletId,
      optionIndex: attempt.optionIndex ?? -1,
      text: attempt.text,
      kind: attempt.kind,
      addedLines: attempt.lineDelta,
      lastLineRatio: attempt.lastLineRatio,
      ...(attempt.baseText ? { baseText: attempt.baseText } : {}),
      ...(attempt.fragmentText ? { fragmentText: attempt.fragmentText } : {}),
      ...(attempt.requirementIds
        ? { requirementIds: attempt.requirementIds }
        : {}),
    });
    options.set(attempt.bulletId, entries);
  }
  return options;
}

function isOptionKind(
  value: string,
): value is MeasuredTailRepairOption["kind"] {
  return [
    "compact",
    "grounded_rewrite",
    "grounded_modifier",
    "augmented_modifier",
  ].includes(value);
}

function currentLayoutFingerprint(
  workspace: ResumeWorkspace,
  bullet: ResumeWorkspace["compileResult"]["bullets"][number] | undefined,
): string | undefined {
  if (!bullet) return undefined;
  const compile = workspace.compileResult;
  return tailRepairLayoutFingerprint({
    templateId: compile.templateId,
    profileHash: compile.profileHash,
    viewportWidthPx: compile.viewport.widthPx,
    devicePixelRatio: compile.viewport.devicePixelRatio,
    bodyFontSizePx: compile.bodyFontSizePx,
    availableLineWidthPx: bullet.availableLineWidthPx,
    maxBulletLines: workspace.maxBulletLines ?? 3,
    minimumBulletLines: minimumBulletLines(workspace, bullet.bulletId),
  });
}
