import { observedWorkspaceItemLines } from "./item-line-budget.js";
import type { ResumeItemTier, ResumeWorkspace } from "./types.js";

export interface OverflowBulletRemovalTarget {
  bulletId: string;
  itemId: string;
  itemTitle: string;
  tier: ResumeItemTier;
  currentText: string;
  lineCount: number;
  currentBulletCount: number;
  minimumBulletCount?: number;
  currentItemLines?: number;
  minimumItemLines?: number;
  maximumRemovableFromItem: number;
}

export type OverflowReductionPlan =
  | {
    requiredInput: "bulletRemovals";
    overflowPx: number;
    bodyLinesToRemove: number;
    maximumRemovedBullets: 1;
    bulletRemovalTargets: OverflowBulletRemovalTarget[];
  }
  | {
    requiredInput: "reselectWithoutOneExperience";
    overflowPx: number;
    bodyLinesToRemove: number;
    maximumRemovedExperiences: 1;
  };

/** Removes one extra bullet per real compile before allowing source loss. */
export function overflowReductionPlan(
  workspace: ResumeWorkspace,
): OverflowReductionPlan {
  const compile = workspace.compileResult;
  const lineHeight = Math.max(1, compile.bodyLineHeightPx);
  const overflowPx = Math.max(
    compile.overflowPx,
    compile.usedHeightPx - compile.availableHeightPx,
    0,
  );
  const measurements = new Map(
    compile.bullets.map((bullet) => [bullet.bulletId, bullet]),
  );
  const observedItemLines = observedWorkspaceItemLines(workspace);
  const eligibleTargets: OverflowBulletRemovalTarget[] = [];
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      const tier = workspace.itemTiers?.[item.id];
      if (!tier) continue;
      if (workspace.lineBudgetVersion === "item-lines-v1") {
        const budget = workspace.itemLineBudgets?.[item.id];
        const currentItemLines = observedItemLines[item.id] ?? 0;
        if (!budget || item.bullets.length <= 1) continue;
        for (const bullet of item.bullets) {
          const lineCount = measurements.get(bullet.id)?.lineCount ?? 0;
          if (currentItemLines - lineCount < budget.minimumLines) continue;
          eligibleTargets.push({
            bulletId: bullet.id,
            itemId: item.id,
            itemTitle: item.title ?? "",
            tier,
            currentText: bullet.text,
            lineCount,
            currentBulletCount: item.bullets.length,
            currentItemLines,
            minimumItemLines: budget.minimumLines,
            maximumRemovableFromItem: item.bullets.length - 1,
          });
        }
        continue;
      }
      if (tier !== "main" && tier !== "secondary") continue;
      const minimumBulletCount = tier === "main" ? 3 : 2;
      const maximumRemovableFromItem = item.bullets.length - minimumBulletCount;
      if (maximumRemovableFromItem <= 0) continue;
      eligibleTargets.push(...item.bullets.map((bullet) => ({
          bulletId: bullet.id,
          itemId: item.id,
          itemTitle: item.title ?? "",
          tier,
          currentText: bullet.text,
          lineCount: measurements.get(bullet.id)?.lineCount ?? 0,
          currentBulletCount: item.bullets.length,
          minimumBulletCount,
          maximumRemovableFromItem,
        })));
    }
  }
  const preferredTier = eligibleTargets.reduce<ResumeItemTier | undefined>(
    (current, target) => !current || tierRank(target.tier) < tierRank(current)
      ? target.tier : current,
    undefined,
  );
  const tierTargets = preferredTier
    ? eligibleTargets.filter((target) => target.tier === preferredTier)
    : eligibleTargets;
  const measuredLineCounts = tierTargets
    .map((target) => target.lineCount)
    .filter((lineCount) => lineCount > 0);
  const smallestLineCount = measuredLineCounts.length
    ? Math.min(...measuredLineCounts)
    : undefined;
  const bulletRemovalTargets = smallestLineCount === undefined
    ? tierTargets
    : tierTargets.filter((target) => target.lineCount === smallestLineCount);
  const shared = {
    overflowPx: round(overflowPx),
    bodyLinesToRemove: Math.max(
      1,
      Math.ceil(Math.max(overflowPx, 0.01) / lineHeight),
    ),
  };
  return bulletRemovalTargets.length
    ? {
        ...shared,
        requiredInput: "bulletRemovals",
        maximumRemovedBullets: 1,
        bulletRemovalTargets,
      }
    : {
        ...shared,
        requiredInput: "reselectWithoutOneExperience",
        maximumRemovedExperiences: 1,
      };
}

function tierRank(tier: ResumeItemTier): number {
  return tier === "utility" ? 0 : tier === "secondary" ? 1 : 2;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
