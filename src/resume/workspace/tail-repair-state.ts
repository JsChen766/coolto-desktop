export type TailRepairGuidanceMode =
  | "same_line_short"
  | "new_line_short"
  | "too_many_lines"
  | "compacted_too_far"
  | "page_capacity";

export interface TailRepairAttemptRecord {
  bulletId: string;
  sourceTextFingerprint?: string;
  baseTextFingerprint?: string;
  layoutFingerprint?: string;
  optionFingerprint: string;
  kind: string;
  text?: string;
  optionIndex?: number;
  baseText?: string;
  fragmentText?: string;
  requirementIds?: string[];
  characterCount: number;
  lineCount: number;
  lineDelta: number;
  lastLineWidthPx: number;
  availableLineWidthPx: number;
  lastLineRatio: number;
  tailPassed: boolean;
  withinLineLimit: boolean;
  eligible: boolean;
  minimumLineCount?: number;
}

export interface TailRepairRetryGuidance {
  round: number;
  mode: TailRepairGuidanceMode;
  attemptedCount: number;
  bestObserved: {
    characterCount: number;
    lineCount: number;
    lineDelta: number;
    lastLineRatio: number;
  };
  additionalCharacterTargets?: { minimum: number; maximum: number };
  allowedNetLineDelta: { minimum: number; maximum: number };
}

export interface TailRepairRetryState {
  bulletIds: string[];
  round: number;
  attempts: TailRepairAttemptRecord[];
  guidanceByBulletId: Record<string, TailRepairRetryGuidance>;
  /** Compatibility alias for drafts persisted before per-bullet guidance. */
  guidance: TailRepairRetryGuidance;
}

export function tailRepairOptionFingerprint(text: string): string {
  const normalized = text.normalize("NFKC").trim();
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const character of normalized) {
    const value = character.codePointAt(0) ?? 0;
    left = Math.imul(left ^ value, 0x01000193);
    right = Math.imul(right ^ value, 0x85ebca6b);
  }
  return `${normalized.length}:${(left >>> 0).toString(16)}:${
    (right >>> 0).toString(16)
  }`;
}

export function tailRepairLayoutFingerprint(input: {
  templateId: string;
  profileHash: string;
  viewportWidthPx: number;
  devicePixelRatio: number;
  bodyFontSizePx: number;
  availableLineWidthPx: number;
  maxBulletLines: number;
  minimumBulletLines?: number;
}): string {
  return [
    input.templateId,
    input.profileHash,
    input.viewportWidthPx,
    input.devicePixelRatio,
    input.bodyFontSizePx,
    input.availableLineWidthPx,
    input.maxBulletLines,
    input.minimumBulletLines ?? 1,
  ].join(":");
}

export function buildTailRepairRetryState(
  previous: TailRepairRetryState | undefined,
  current: readonly TailRepairAttemptRecord[],
  allowedNetLineDelta: { minimum: number; maximum: number },
  focusBulletIds?: ReadonlySet<string>,
): TailRepairRetryState {
  const attempts = dedupeAttempts([
    ...(previous?.attempts ?? []),
    ...current,
  ]).slice(-256);
  const candidateIds = focusBulletIds?.size
    ? [...focusBulletIds]
    : [...new Set((current.length ? current : attempts).map(
        (attempt) => attempt.bulletId,
      ))];
  const bulletIds = candidateIds.filter((bulletId) =>
    attempts.some((attempt) => attempt.bulletId === bulletId)
  ).sort((left, right) =>
    attemptScore(bestForBullet(attempts, left)) -
      attemptScore(bestForBullet(attempts, right)) || left.localeCompare(right)
  );
  const guidanceByBulletId = Object.fromEntries(bulletIds.map((bulletId) => [
    bulletId,
    guidanceForBullet(
      previous,
      attempts,
      bulletId,
      allowedNetLineDelta,
    ),
  ]));
  const guidance = guidanceByBulletId[bulletIds[0]!];
  if (!guidance) throw new Error("尾行修复缺少候选实测记录");
  return {
    bulletIds,
    round: Math.max(...Object.values(guidanceByBulletId).map(
      (item) => item.round,
    )),
    attempts,
    guidanceByBulletId,
    guidance,
  };
}

function guidanceForBullet(
  previous: TailRepairRetryState | undefined,
  attempts: readonly TailRepairAttemptRecord[],
  bulletId: string,
  allowedNetLineDelta: { minimum: number; maximum: number },
): TailRepairRetryGuidance {
  const bulletAttempts = attempts.filter(
    (attempt) => attempt.bulletId === bulletId,
  );
  const best = bestFocus(bulletAttempts);
  const prior = previous?.guidanceByBulletId?.[bulletId] ??
    (previous?.bulletIds.includes(bulletId) ? previous.guidance : undefined);
  const round = (prior?.round ?? 0) + 1;
  return {
    round,
    mode: guidanceMode(best, allowedNetLineDelta),
    attemptedCount: bulletAttempts.length,
    bestObserved: {
      characterCount: best.characterCount,
      lineCount: best.lineCount,
      lineDelta: best.lineDelta,
      lastLineRatio: best.lastLineRatio,
    },
    ...additionalCharacterTargets(best),
    allowedNetLineDelta,
  };
}

function bestForBullet(
  attempts: readonly TailRepairAttemptRecord[],
  bulletId: string,
) {
  return bestFocus(attempts.filter((attempt) => attempt.bulletId === bulletId));
}

function bestFocus(attempts: readonly TailRepairAttemptRecord[]) {
  const focus = [...attempts].sort((left, right) =>
    attemptScore(left) - attemptScore(right) ||
    left.bulletId.localeCompare(right.bulletId)
  )[0];
  if (!focus) throw new Error("尾行修复缺少候选实测记录");
  return focus;
}

function attemptScore(attempt: TailRepairAttemptRecord): number {
  if (attempt.eligible) return 0;
  return (attempt.withinLineLimit ? 0 : 10) +
    Math.abs(0.7 - attempt.lastLineRatio) +
    Math.abs(attempt.lineDelta) * 0.05;
}

function guidanceMode(
  attempt: TailRepairAttemptRecord,
  allowed: { minimum: number; maximum: number },
): TailRepairGuidanceMode {
  if (attempt.eligible &&
    (attempt.lineDelta < allowed.minimum || attempt.lineDelta > allowed.maximum)) {
    return "page_capacity";
  }
  if (attempt.lineCount < (attempt.minimumLineCount ?? 1)) {
    return "compacted_too_far";
  }
  if (!attempt.withinLineLimit) return "too_many_lines";
  if (attempt.lineDelta > 0) return "new_line_short";
  if (attempt.lineDelta < 0) return "compacted_too_far";
  return "same_line_short";
}

function additionalCharacterTargets(attempt: TailRepairAttemptRecord) {
  if (!attempt.withinLineLimit || attempt.tailPassed) return {};
  const width = attempt.availableLineWidthPx;
  const measured = Math.max(
    1,
    (Math.max(0, attempt.lineCount - 1) * width + attempt.lastLineWidthPx) /
      Math.max(1, attempt.characterCount),
  );
  const minimum = Math.max(
    1,
    Math.ceil((width * 0.73 - attempt.lastLineWidthPx) / measured),
  );
  return {
    additionalCharacterTargets: {
      minimum,
      maximum: Math.max(
        minimum,
        Math.floor((width * 0.88 - attempt.lastLineWidthPx) / measured),
      ),
    },
  };
}

function dedupeAttempts(
  attempts: readonly TailRepairAttemptRecord[],
): TailRepairAttemptRecord[] {
  return [...new Map(attempts.map((attempt) => [
    `${attempt.bulletId}:${attempt.sourceTextFingerprint ?? "legacy"}:` +
      attempt.optionFingerprint,
    attempt,
  ])).values()];
}
