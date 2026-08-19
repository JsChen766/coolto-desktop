import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import { concreteExpansionHints } from "./tail-repair-hints.js";
import type { ResumeWorkspace } from "./types.js";

export { concreteExpansionHints } from "./tail-repair-hints.js";

export interface TailRepairTarget {
  bulletId: string;
  currentText: string;
  currentLineCount: number;
  evidenceIds: string[];
  sourceQuotes: string[];
  expansionGoal: string;
  concreteExpansionHints: string[];
  zeroProgressRounds: number;
}

export interface TailRepairBatch {
  targets: TailRepairTarget[];
  remainingTailCount: number;
}

/** Every failed bullet is returned from its current formal text. */
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
  const failed = workspace.compileResult.bullets.filter(
    (bullet) => !bullet.passed,
  );
  const targets = failed.flatMap((observed) => {
    const currentText = textById.get(observed.bulletId);
    if (!currentText) return [];
    const evidenceIds = provenanceById.get(observed.bulletId)?.evidenceIds ?? [];
    const sourceQuotes = evidenceIds.flatMap((id) => {
      const quote = evidenceById.get(id);
      return quote ? [quote] : [];
    });
    return [{
      bulletId: observed.bulletId,
      currentText,
      currentLineCount: observed.lineCount,
      evidenceIds,
      sourceQuotes,
      expansionGoal: semanticExpansionGoal(observed.lastLineRatio),
      concreteExpansionHints: concreteExpansionHints(sourceQuotes, currentText),
      zeroProgressRounds: rejectedRounds(workspace, observed.bulletId),
    }];
  }).sort((left, right) =>
    attemptedRounds(workspace, left.bulletId) -
      attemptedRounds(workspace, right.bulletId) ||
    appliedRounds(workspace, left.bulletId) -
      appliedRounds(workspace, right.bulletId) ||
    rejectedRounds(workspace, left.bulletId) -
      rejectedRounds(workspace, right.bulletId) ||
    left.currentLineCount - right.currentLineCount ||
    left.bulletId.localeCompare(right.bulletId)
  );
  return { targets, remainingTailCount: failed.length };
}

function semanticExpansionGoal(lastLineRatio: number): string {
  if (lastLineRatio < 0.35) {
    return "补充一个完整的具体方法、行动细节或证据支持的结果分句";
  }
  if (lastLineRatio < 0.55) {
    return "补充一个具体方法、对象、范围或交付物短语";
  }
  return "自然重组整句并补充一个简短、具体且有来源的限定语";
}

function attemptedRounds(workspace: ResumeWorkspace, bulletId: string): number {
  return workspace.tailRepairProgress?.byBulletId[bulletId]?.attemptedRounds ?? 0;
}

function appliedRounds(workspace: ResumeWorkspace, bulletId: string): number {
  return workspace.tailRepairProgress?.byBulletId[bulletId]?.appliedRounds ?? 0;
}

function rejectedRounds(workspace: ResumeWorkspace, bulletId: string): number {
  return workspace.tailRepairProgress?.byBulletId[bulletId]
    ?.zeroProgressRounds ?? 0;
}
