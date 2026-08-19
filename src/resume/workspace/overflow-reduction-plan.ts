import type { ResumeWorkspace } from "./types.js";

export interface OverflowBulletRemovalTarget {
  bulletId: string;
  itemId: string;
  itemTitle: string;
  tier: "main" | "secondary";
  currentText: string;
  lineCount: number;
  currentBulletCount: number;
  minimumBulletCount: number;
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
  const eligibleTargets = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const tier = workspace.itemTiers?.[item.id];
      if (tier !== "main" && tier !== "secondary") return [];
      const minimumBulletCount = tier === "main" ? 3 : 2;
      const maximumRemovableFromItem = item.bullets.length - minimumBulletCount;
      if (maximumRemovableFromItem <= 0) return [];
      return item.bullets.map((bullet) => ({
        bulletId: bullet.id,
        itemId: item.id,
        itemTitle: item.title ?? "",
        tier,
        currentText: bullet.text,
        lineCount: measurements.get(bullet.id)?.lineCount ?? 0,
        currentBulletCount: item.bullets.length,
        minimumBulletCount,
        maximumRemovableFromItem,
      }));
    })
  );
  const measuredLineCounts = eligibleTargets
    .map((target) => target.lineCount)
    .filter((lineCount) => lineCount > 0);
  const smallestLineCount = measuredLineCounts.length
    ? Math.min(...measuredLineCounts)
    : undefined;
  const bulletRemovalTargets = smallestLineCount === undefined
    ? eligibleTargets
    : eligibleTargets.filter((target) => target.lineCount === smallestLineCount);
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

function round(value: number): number {
  return Number(value.toFixed(2));
}
