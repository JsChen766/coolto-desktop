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

export interface ItemLineWorkUnit {
  workUnitId: string;
  label: string;
  kind: string;
  evidence: ItemLineEvidence[];
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
    workUnitIds: string[];
  }>;
  availableEvidence: ItemLineEvidence[];
  availableWorkUnits: ItemLineWorkUnit[];
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
  const evidenceText = new Map(evidence.map((entry) => [
    entry.evidenceId, entry.text,
  ]));
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
      const availableWorkUnits = workspace.workUnitMap?.status === "ready"
        ? workspace.workUnitMap.units.filter((unit) =>
            unit.itemId === item.id && (!selected || unit.evidenceIds.some(
              (id) => used.has(id) || selected.has(id),
            ))
          ).map((unit) => ({
            workUnitId: unit.workUnitId,
            label: unit.label,
            kind: unit.kind,
            evidence: unit.evidenceIds.map((evidenceId) => ({
              evidenceId,
              text: evidenceText.get(evidenceId) ?? "",
            })),
          }))
        : [];
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
          workUnitIds: [...(provenance.get(bullet.id)?.workUnitIds ?? [])],
        })),
        availableEvidence,
        availableWorkUnits,
        requiredEdit: [
          `本 Experience 目标总行数约 ${budget.targetLines} 行（最低 ${budget.minimumLines} 行）`,
          "每条 bullet 绑定一个或多个完整 workUnitIds，并完整引用这些 WorkUnit 的全部 evidence；同一 WorkUnit 不得拆到多条 bullet",
          "相关度主要通过 Experience 总行数和核心 WorkUnit 的展开行数表达，不用 bullet 数量凑重要性",
          "用一次 items 提交该 item 的完整 bullet 列表；每条提供 plannedLines，全部 plannedLines 之和应接近目标总行数",
        ].join("；"),
      }];
    }),
  );
}
