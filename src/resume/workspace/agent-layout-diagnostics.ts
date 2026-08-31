import type { ResumeSectionType } from "../types.js";
import { resolveTailPolicy } from "../tail-policy.js";
import { minimumResumeBulletCount } from "./bullet-count-rules.js";
import { observedWorkspaceItemLines } from "./item-line-budget.js";
import type { ResumeItemTier, ResumeWorkspace } from "./types.js";

export interface AgentLayoutItem {
  itemId: string;
  sectionType: ResumeSectionType;
  tier: ResumeItemTier | null;
  bullets: Array<{ bulletId: string }>;
}

export interface ItemDiagnostic {
  itemId: string;
  tier: string;
  bulletCount: number;
  passed: boolean;
  currentLines?: number;
  targetLines?: number | null;
  minimumLines?: number | null;
  minimumRequired?: number;
}

export function buildItemDiagnostics(
  workspace: ResumeWorkspace,
  items: readonly AgentLayoutItem[],
): ItemDiagnostic[] {
  const observed = observedWorkspaceItemLines(workspace);
  const result: ItemDiagnostic[] = [];
  for (const item of items) {
    const budget = workspace.itemLineBudgets?.[item.itemId];
    if (workspace.lineBudgetVersion === "item-lines-v1" && budget) {
      const currentLines = observed[item.itemId] ?? 0;
      result.push({
        itemId: item.itemId,
        tier: item.tier ?? budget.tier,
        bulletCount: item.bullets.length,
        currentLines,
        targetLines: budget.targetLines,
        minimumLines: budget.minimumLines,
        passed: (!item.tier || budget.tier === item.tier) &&
          item.bullets.length > 0 &&
          (currentLines >= budget.minimumLines || workspace.compileResult.qualified),
      });
      continue;
    }
    const minimum = minimumResumeBulletCount({
      sectionType: item.sectionType, itemId: item.itemId,
      ...(item.tier ? { tier: item.tier } : {}),
    });
    if (minimum) result.push({
      itemId: item.itemId,
      tier: item.tier ?? "skills",
      bulletCount: item.bullets.length,
      minimumRequired: minimum,
      passed: item.bullets.length >= minimum,
    });
  }
  return result;
}

export function buildBulletDiagnostics(
  workspace: ResumeWorkspace,
  items: readonly AgentLayoutItem[],
) {
  const measured = new Map(
    workspace.compileResult.bullets.map((entry) => [entry.bulletId, entry]),
  );
  return items.flatMap((item) => item.bullets.map((bullet) => {
    const observed = measured.get(bullet.bulletId);
    const available = observed?.availableLineWidthPx ?? 0;
    const policy = resolveTailPolicy(observed?.tailPolicyVersion);
    const ceuPx = observed?.ceuPx ?? 0;
    const hardDeficit = Math.max(
      0, available * policy.hardMinRatio - (observed?.lastLineWidthPx ?? 0),
    );
    const idealDeficit = Math.max(
      0, available * policy.repairIdealRatio - (observed?.lastLineWidthPx ?? 0),
    );
    return {
      bulletId: bullet.bulletId,
      lineCount: observed?.lineCount ?? 0,
      lastLineWidthPx: observed?.lastLineWidthPx ?? 0,
      availableLineWidthPx: available,
      lastLineRatio: observed?.lastLineRatio ?? 0,
      tailPolicyVersion: policy.version,
      ceuPx,
      minimumPassingTailWidthPx: round(available * policy.hardMinRatio),
      hardTailDeficitPx: round(hardDeficit),
      idealTailDeficitPx: round(idealDeficit),
      hardTailDeficitCjk: ceuPx > 0 ? round(hardDeficit / ceuPx) : 0,
      idealTailDeficitCjk: ceuPx > 0 ? round(idealDeficit / ceuPx) : 0,
      tailWidthDeficitPx: round(hardDeficit),
      passed: observed?.passed ?? false,
    };
  }));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
