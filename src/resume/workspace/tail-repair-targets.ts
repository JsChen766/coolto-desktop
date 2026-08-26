import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import {
  isTailRepairExhausted,
  tailRepairMode,
  type TailGrowthFailureType,
  type TailAttemptFeedback,
  type TailRepairMode,
} from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";
import { resolveTailPolicy } from "../tail-policy.js";
import {
  buildTailLengthBudget,
  type TailLengthBudget,
} from "./tail-length-budget.js";
import { availableSemanticTailEvidence, type SemanticTailEvidence } from
  "./semantic-tail-evidence.js";

export interface TailRepairTarget {
  bulletId: string;
  currentText: string;
  currentLineCount: number;
  currentLastLineRatio: number;
  lengthBudget?: TailLengthBudget;
  sourceQuotes: string[];
  availableEvidence: SemanticTailEvidence[];
  growthHint: string;
  rejectedGrowths: string[];
  rejectedReflows: string[];
  consecutiveRejects: number;
  reflowAttempts: number;
  mode: TailRepairMode;
  exhausted: boolean;
  lastFailureType?: TailGrowthFailureType;
  lastFailureReason?: string;
  lastAttemptFeedback?: TailAttemptFeedback;
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
    const formalText = textById.get(observed.bulletId);
    if (!formalText) return [];
    const evidenceIds = provenanceById.get(observed.bulletId)?.evidenceIds ?? [];
    const progress = workspace.tailRepairProgress?.byBulletId[observed.bulletId];
    const formalLengthBudget = buildTailLengthBudget(
      observed,
      resolveTailPolicy(observed.tailPolicyVersion),
    );
    const currentText = progress?.workingText ?? formalText;
    const currentLineCount = progress?.workingLineCount ?? observed.lineCount;
    const currentLastLineRatio = progress?.workingLastLineRatio ??
      observed.lastLineRatio;
    const lengthBudget = progress?.workingLengthBudget ?? formalLengthBudget;
    const consecutiveRejects = progress?.consecutiveRejects ??
      progress?.zeroProgressRounds ?? 0;
    const mode = lengthBudget?.recommendedMode === "reflow"
      ? "reflow"
      : tailRepairMode(progress);
    return [{
      bulletId: observed.bulletId,
      currentText,
      currentLineCount,
      currentLastLineRatio,
      ...(lengthBudget ? { lengthBudget } : {}),
      sourceQuotes: evidenceIds.flatMap((id) => {
        const quote = evidenceById.get(id);
        return quote ? [quote] : [];
      }),
      availableEvidence: availableSemanticTailEvidence(
        workspace,
        observed.bulletId,
      ),
      growthHint: semanticGrowthHint(observed.lastLineRatio, lengthBudget),
      rejectedGrowths: progress?.rejectedGrowths ??
        progress?.rejectedAttempts ?? [],
      rejectedReflows: progress?.rejectedReflows ?? [],
      consecutiveRejects,
      reflowAttempts: progress?.reflowAttempts ?? 0,
      mode,
      exhausted: isTailRepairExhausted(progress),
      ...(progress?.lastFailureType
        ? { lastFailureType: progress.lastFailureType }
        : {}),
      ...(progress?.lastFailureReason
        ? { lastFailureReason: progress.lastFailureReason }
        : {}),
      ...(progress?.lastAttemptFeedback
        ? { lastAttemptFeedback: progress.lastAttemptFeedback }
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

function semanticGrowthHint(
  lastLineRatio: number,
  budget: TailLengthBudget | undefined,
): string {
  if (budget?.recommendedMode === "micro") return "补一个有来源的短限定语";
  if (budget?.recommendedMode === "phrase") {
    return "补一个有来源的具体方法、对象或范围短语";
  }
  if (budget?.recommendedMode === "clause") return "补一个有来源的完整分句";
  if (budget?.recommendedMode === "reflow") return "改用保持事实的整句等价展开";
  if (lastLineRatio < 0.35) {
    return "补一个有来源的完整分句，可选择方法、范围、交付物或结果";
  }
  if (lastLineRatio < 0.55) {
    return "补一个有来源的具体短语，可选择对象、指标、工具或执行范围";
  }
  return "补一个简短且有来源的限定语，优先选择尚未表达的专业细节";
}
