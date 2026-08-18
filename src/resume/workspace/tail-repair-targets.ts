import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import { bulletCharacterTargets } from "./character-targets.js";
import { activeTailRepairTargets } from "./tail-repair-balance-targets.js";
import { buildTailRepairRetryState } from "./tail-repair-state.js";
import type {
  TailRepairAttemptRecord,
  TailRepairRetryGuidance,
} from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";
import { tailRepairWorkingState } from "./tail-repair-working-state.js";
import { withEditInstruction } from "./tail-repair-edit-instruction.js";

export interface TailRepairEditInstruction {
  direction: "expand" | "compact" | "hold";
  minimumCharacters: number;
  maximumCharacters: number;
}

export interface TailRepairTarget {
  bulletId: string;
  role: "repair" | "page_balance";
  balanceForBulletId?: string;
  requestedLineDelta?: -1 | 1;
  currentText: string;
  evidenceIds: string[];
  sourceQuotes: string[];
  groundedModifierCharacterTargets: { minimum: number; maximum: number };
  addOneLineModifierCharacterTargets?: { minimum: number; maximum: number };
  compactTotalCharacterTargets?: { minimum: number; maximum: number };
  retryGuidance?: TailRepairRetryGuidance;
  editInstruction: TailRepairEditInstruction;
}

export interface TailRepairBatch {
  targets: TailRepairTarget[];
  remainingTailCount: number;
}

/**
 * Returns a bounded, evidence-complete repair batch. The host ranks only by
 * mechanical character deficit; the Agent still decides how to express facts.
 */
export function tailRepairBatch(workspace: ResumeWorkspace): TailRepairBatch {
  const provenanceById = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const textById = new Map(
    workspace.structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
      ),
    ),
  );
  const evidenceById = new Map(
    workspaceEvidenceRecords(
      workspace.sourceSnapshot,
      workspace.supplementalEvidence,
    ).map((record) => [record.evidenceId, record.text]),
  );
  const failed = workspace.compileResult.bullets.filter((bullet) => !bullet.passed);
  const failedIds = new Set(failed.map((bullet) => bullet.bulletId));
  const allTargets = workspace.compileResult.bullets.flatMap((observed) => {
    const currentText = textById.get(observed.bulletId);
    if (!currentText) return [];
    const working = tailRepairWorkingState(
      workspace,
      observed.bulletId,
      currentText,
      observed,
    );
    const characterTargets = bulletCharacterTargets(
      working.text,
      working.lineCount,
      working.lastLineWidthPx,
      working.availableLineWidthPx,
    );
    if (!characterTargets) return [];
    const evidenceIds = provenanceById.get(observed.bulletId)?.evidenceIds ?? [];
    const currentCharacters = [...working.text].length;
    const minimum = Math.max(
      1,
      characterTargets.passCurrentLineCount.minimum - currentCharacters,
    );
    const addOneLine = working.lineCount < (workspace.maxBulletLines ?? 3)
      ? addedRange(
          characterTargets.addExactlyOneLine,
          currentCharacters,
        )
      : undefined;
    const compact = compactRange(
      working.lineCount,
      working.availableLineWidthPx,
      characterTargets.measuredAverageCharacterWidthPx,
      currentCharacters,
    );
    const target = {
      bulletId: observed.bulletId,
      role: observed.passed ? "page_balance" as const : "repair" as const,
      currentText: working.text,
      evidenceIds,
      sourceQuotes: evidenceIds.flatMap((id) => {
        const quote = evidenceById.get(id);
        return quote ? [quote] : [];
      }),
      groundedModifierCharacterTargets: {
        minimum,
        maximum: Math.max(
          minimum,
          characterTargets.passCurrentLineCount.maximum - currentCharacters,
        ),
      },
      ...(addOneLine
        ? { addOneLineModifierCharacterTargets: addOneLine }
        : {}),
      ...(compact ? { compactTotalCharacterTargets: compact } : {}),
      ...(retryGuidance(workspace, observed.bulletId)
        ? { retryGuidance: retryGuidance(workspace, observed.bulletId)! }
        : {}),
      editInstruction: { direction: "expand", minimumCharacters: minimum,
        maximumCharacters: Math.max(
          minimum,
          characterTargets.passCurrentLineCount.maximum - currentCharacters,
        ) } as TailRepairEditInstruction,
    };
    return withEditInstruction(target);
  }).sort((left, right) =>
    left.groundedModifierCharacterTargets.minimum -
      right.groundedModifierCharacterTargets.minimum ||
    right.sourceQuotes.join("").length - left.sourceQuotes.join("").length ||
    left.bulletId.localeCompare(right.bulletId)
  );
  const targets = allTargets.filter((target) => failedIds.has(target.bulletId));
  const activeTargets = activeTailRepairTargets(workspace, targets, allTargets);
  return {
    targets: activeTargets,
    remainingTailCount: failed.length,
  };
}

export function narrowTailRepairBatch(
  workspace: ResumeWorkspace,
  attempts: readonly TailRepairAttemptRecord[],
  allowedNetLineDelta: { minimum: number; maximum: number },
): ResumeWorkspace {
  if (!attempts.length) return workspace;
  return {
    ...workspace,
    tailRepairRetry: buildTailRepairRetryState(
      workspace.tailRepairRetry,
      attempts,
      allowedNetLineDelta,
      new Set(workspace.compileResult.bullets
        .filter((bullet) => !bullet.passed)
        .map((bullet) => bullet.bulletId)),
    ),
  };
}

function retryGuidance(
  workspace: ResumeWorkspace,
  bulletId: string,
): TailRepairRetryGuidance | undefined {
  const retry = workspace.tailRepairRetry;
  if (!retry?.bulletIds.includes(bulletId)) return undefined;
  return retry.guidanceByBulletId?.[bulletId] ?? retry.guidance;
}

function addedRange(
  total: { minimum: number; maximum: number },
  currentCharacters: number,
): { minimum: number; maximum: number } {
  const minimum = Math.max(1, total.minimum - currentCharacters);
  return {
    minimum,
    maximum: Math.max(minimum, total.maximum - currentCharacters),
  };
}

function compactRange(
  lineCount: number,
  lineWidthPx: number,
  averageCharacterWidthPx: number,
  currentCharacters: number,
): { minimum: number; maximum: number } | undefined {
  if (lineCount <= 1 || averageCharacterWidthPx <= 0) return undefined;
  const fullLines = lineCount - 2;
  const minimum = Math.ceil(
    ((fullLines + 0.73) * lineWidthPx) / averageCharacterWidthPx,
  );
  const maximum = Math.min(
    currentCharacters - 1,
    Math.floor(((fullLines + 0.9) * lineWidthPx) / averageCharacterWidthPx),
  );
  return minimum <= maximum ? { minimum, maximum } : undefined;
}
