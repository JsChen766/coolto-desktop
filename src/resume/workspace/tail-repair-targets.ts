import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import {
  isTailRepairExhausted,
  tailRepairMode,
  type TailGrowthFailureType,
  type TailRepairMode,
} from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";

export interface TailRepairTarget {
  bulletId: string;
  currentText: string;
  currentLineCount: number;
  sourceQuotes: string[];
  growthHint: string;
  rejectedGrowths: string[];
  rejectedReflows: string[];
  consecutiveRejects: number;
  reflowAttempts: number;
  mode: TailRepairMode;
  exhausted: boolean;
  lastFailureType?: TailGrowthFailureType;
}

export interface TailRepairBatch {
  targets: TailRepairTarget[];
  remainingTailCount: number;
}

/** Returns every failed bullet from its immutable formal baseline. */
export function tailRepairBatch(workspace: ResumeWorkspace): TailRepairBatch {
  const provenanceById = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const textById = new Map(workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
    ),
  ));
  const evidenceById = new Map(workspaceEvidenceRecords(
    workspace.sourceSnapshot,
    workspace.supplementalEvidence,
  ).map((record) => [record.evidenceId, record.text]));
  const targets = workspace.compileResult.bullets.filter(
    (bullet) => !bullet.passed,
  ).flatMap((observed) => {
    const currentText = textById.get(observed.bulletId);
    if (!currentText) return [];
    const evidenceIds = provenanceById.get(observed.bulletId)?.evidenceIds ?? [];
    const progress = workspace.tailRepairProgress?.byBulletId[observed.bulletId];
    const consecutiveRejects = progress?.consecutiveRejects ??
      progress?.zeroProgressRounds ?? 0;
    return [{
      bulletId: observed.bulletId,
      currentText,
      currentLineCount: observed.lineCount,
      sourceQuotes: evidenceIds.flatMap((id) => {
        const quote = evidenceById.get(id);
        return quote ? [quote] : [];
      }),
      growthHint: semanticGrowthHint(observed.lastLineRatio),
      rejectedGrowths: progress?.rejectedGrowths ??
        progress?.rejectedAttempts ?? [],
      rejectedReflows: progress?.rejectedReflows ?? [],
      consecutiveRejects,
      reflowAttempts: progress?.reflowAttempts ?? 0,
      mode: tailRepairMode(progress),
      exhausted: isTailRepairExhausted(progress),
      ...(progress?.lastFailureType
        ? { lastFailureType: progress.lastFailureType }
        : {}),
      lastLineRatio: observed.lastLineRatio,
    }];
  }).sort((left, right) =>
    Number(left.exhausted) - Number(right.exhausted) ||
    left.consecutiveRejects - right.consecutiveRejects ||
    right.lastLineRatio - left.lastLineRatio ||
    left.bulletId.localeCompare(right.bulletId)
  ).map(({ lastLineRatio: _ratio, ...target }) => target);
  return { targets, remainingTailCount: targets.length };
}

function semanticGrowthHint(lastLineRatio: number): string {
  if (lastLineRatio < 0.35) {
    return "补一个有来源的完整分句，可选择方法、范围、交付物或结果";
  }
  if (lastLineRatio < 0.55) {
    return "补一个有来源的具体短语，可选择对象、指标、工具或执行范围";
  }
  return "补一个简短且有来源的限定语，优先选择尚未表达的专业细节";
}
