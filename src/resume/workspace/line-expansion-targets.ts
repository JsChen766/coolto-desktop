import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import { SEMANTIC_LINE_EXPANSION_REQUIRED_EDIT } from "./semantic-line-expansion-instruction.js";
import type { ResumeWorkspace } from "./types.js";
import {
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import {
  factNeutralClosureActive,
  isFirstResumeGeneration,
} from "./first-generation-policy.js";
import {
  RESUME_DEFAULT_TARGET_USAGE_RATIO,
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
} from "../compiler-types.js";

const MAX_LINE_EXPANSIONS_PER_BATCH = 12;

export interface LineExpansionTarget {
  requiredEdit: string;
  bulletId: string;
  currentText: string;
  currentLines: number;
  plannedLines: number;
  remainingPlannedLines: number;
  evidenceIds: string[];
  sourceQuotes: string[];
  contentMode?: "fact_neutral";
}

/** Bounded structural targets; the Agent decides which facts are relevant. */
export function lineExpansionTargets(
  workspace: ResumeWorkspace,
): LineExpansionTarget[] {
  const requiredLines = pageFillRequiredLines(workspace);
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
  const candidates = workspace.compileResult.bullets.flatMap((bullet) => {
    const currentText = textById.get(bullet.bulletId);
    if (!currentText) return [];
    const evidenceIds = provenanceById.get(bullet.bulletId)?.evidenceIds ?? [];
    const sourceQuotes = evidenceIds.flatMap((id) => {
      const quote = evidenceById.get(id);
      return quote ? [quote] : [];
    });
    if (sourceQuotes.length === 0) return [];
    const authorizedNeutral = factNeutralClosureActive(workspace);
    const plannedLines = authorizedNeutral
      ? Math.max(
          bullet.lineCount + 1,
          workspace.bulletLinePlans?.[bullet.bulletId]?.plannedLines ?? 0,
        )
      : workspace.bulletLinePlans?.[bullet.bulletId]?.plannedLines ??
        bullet.lineCount + 1;
    const remainingPlannedLines = Math.max(0, plannedLines - bullet.lineCount);
    if (remainingPlannedLines === 0) return [];
    return [{
      target: {
        requiredEdit: authorizedNeutral
          ? "用户已确认没有更多事实。完整保留 currentText，优先在背景、能力或方法、行动与结果之间插入不新增事实的自然连接；没有清晰内部边界时才放在句首或句尾。三分之二只用于排版验收，不得默认追加固定尾缀；传 contentMode=fact_neutral"
          : SEMANTIC_LINE_EXPANSION_REQUIRED_EDIT,
        bulletId: bullet.bulletId,
        currentText,
        currentLines: bullet.lineCount,
        plannedLines,
        remainingPlannedLines,
        evidenceIds,
        sourceQuotes,
        ...(authorizedNeutral
          ? { contentMode: "fact_neutral" as const }
          : {}),
      },
      expansionCapacity: [...sourceQuotes.join("")].length -
        [...currentText].length,
    }];
  }).sort((left, right) =>
    right.target.remainingPlannedLines - left.target.remainingPlannedLines ||
    left.target.currentLines - right.target.currentLines ||
    right.expansionCapacity - left.expansionCapacity ||
    left.target.bulletId.localeCompare(right.target.bulletId)
  );
  let plannedCapacity = 0;
  return candidates.filter(({ target }) => {
    if (plannedCapacity >= requiredLines) return false;
    plannedCapacity += target.remainingPlannedLines;
    return true;
  }).slice(0, MAX_LINE_EXPANSIONS_PER_BATCH).map(({ target }) => target);
}

function pageFillRequiredLines(workspace: ResumeWorkspace): number {
  const compile = workspace.compileResult;
  const deficit = Math.max(
    0,
    compile.availableHeightPx * (isFirstResumeGeneration(workspace)
      ? RESUME_DEFAULT_TARGET_USAGE_RATIO
      : RESUME_GLOBAL_MINIMUM_USAGE_RATIO) -
      compile.usedHeightPx - RESUME_LAYOUT_TOLERANCE_PX,
  );
  return Math.max(
    1,
    Math.ceil(deficit / Math.max(1, compile.bodyLineHeightPx)),
  );
}
