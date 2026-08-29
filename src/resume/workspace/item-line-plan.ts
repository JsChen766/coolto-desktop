import {
  isStandaloneScalarEvidence,
  writableEvidenceCandidates,
} from "../quality/evidence-candidates.js";
import { selectedEvidenceIds } from "./evidence-assessment.js";
import { observedWorkspaceItemLines } from "./item-line-budget.js";
import type { ResumeItemTier, ResumeWorkspace } from "./types.js";
import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";

export interface ItemLineEvidence {
  evidenceId: string;
  text: string;
}

export interface ItemLineWriteTarget {
  itemId: string;
  sourceExperienceId: string;
  tier: ResumeItemTier;
  currentLines: number;
  targetLines: number;
  minimumLines: number;
  remainingLines: number;
  currentBullets: Array<{
    bulletId: string;
    text: string;
    plannedLines: number;
    evidenceIds: string[];
  }>;
  availableEvidence: ItemLineEvidence[];
  requiredEdit: string;
}

export function itemLineWriteTargets(
  workspace: ResumeWorkspace,
): ItemLineWriteTarget[] {
  if (workspace.lineBudgetVersion !== "item-lines-v1") return [];
  const observed = observedWorkspaceItemLines(workspace);
  const provenance = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const selected = selectedEvidenceIds(workspace);
  const used = new Set(
    (workspace.bulletProvenance ?? []).flatMap((entry) => entry.evidenceIds),
  );
  const formalUsageReached = workspace.compileResult.pageCount === 1 &&
    workspace.compileResult.overflowPx <= RESUME_LAYOUT_TOLERANCE_PX &&
    workspace.compileResult.usedHeightPx + RESUME_LAYOUT_TOLERANCE_PX >=
      workspace.compileResult.availableHeightPx *
        RESUME_GLOBAL_MINIMUM_USAGE_RATIO;
  const evidence = [
    ...writableEvidenceCandidates(workspace.sourceSnapshot).map((entry) => ({
      evidenceId: entry.evidenceId,
      experienceId: entry.experienceId,
      text: entry.sourceQuote,
    })),
    ...(workspace.supplementalEvidence ?? [])
      .filter((entry) => !isStandaloneScalarEvidence(entry.text))
      .map((entry) => ({
        evidenceId: entry.evidenceId,
        experienceId: entry.experienceId,
        text: entry.text,
      })),
  ];
  return workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const budget = workspace.itemLineBudgets?.[item.id];
      const tier = workspace.itemTiers?.[item.id] ?? budget?.tier;
      if (!budget || !tier) return [];
      const currentLines = observed[item.id] ?? 0;
      const selectedForItem = selected
        ? evidence.filter((entry) =>
            entry.experienceId === item.source_experience_id &&
            selected.has(entry.evidenceId)
          )
        : [];
      const needsSelectedIntegration = selectedForItem.some(
        (entry) => !used.has(entry.evidenceId),
      );
      if (item.bullets.length > 0 &&
        (currentLines >= budget.minimumLines || formalUsageReached) &&
        !needsSelectedIntegration) return [];
      const availableEvidence = evidence.filter((entry) =>
        entry.experienceId === item.source_experience_id &&
        (!selected || used.has(entry.evidenceId) || selected.has(entry.evidenceId))
      ).map(({ evidenceId, text }) => ({ evidenceId, text }));
      return [{
        itemId: item.id,
        sourceExperienceId: item.source_experience_id ?? "",
        tier,
        currentLines,
        targetLines: budget.targetLines,
        minimumLines: budget.minimumLines,
        remainingLines: Math.max(0, budget.targetLines - currentLines),
        currentBullets: item.bullets.map((bullet) => ({
          bulletId: bullet.id,
          text: bullet.text,
          plannedLines:
            workspace.bulletLinePlans?.[bullet.id]?.plannedLines ?? 1,
          evidenceIds: [...(provenance.get(bullet.id)?.evidenceIds ?? [])],
        })),
        availableEvidence,
        requiredEdit: [
          `本 Experience 目标总行数约 ${budget.targetLines} 行（最低 ${budget.minimumLines} 行）`,
          "先按独立工作/项目/报告分组：一个工作单元只形成一条 bullet，同一工作单元的多个 evidence 合并引用",
          "用一次 items 提交该 item 的完整 bullet 列表；每条提供 plannedLines，全部 plannedLines 之和应接近目标总行数",
        ].join("；"),
      }];
    }),
  );
}
