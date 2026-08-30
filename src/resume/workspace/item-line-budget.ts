import {
  RESUME_DEFAULT_TARGET_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
  type ResumeCompileResult,
} from "../compiler-types.js";
import type { ResumeStructure } from "../types.js";
import type {
  ResumeItemLineBudget,
  ResumeItemTier,
  ResumeWorkspace,
} from "./types.js";

const TIER_WEIGHT: Record<ResumeItemTier, number> = {
  main: 3,
  secondary: 2,
  utility: 1,
};

interface BudgetItem {
  itemId: string;
  tier: ResumeItemTier;
  order: number;
}

export function createItemLineBudgets(input: {
  structure: ResumeStructure;
  itemTiers: Readonly<Record<string, ResumeItemTier>>;
  compileResult: ResumeCompileResult;
}): Record<string, ResumeItemLineBudget> {
  const items = budgetItems(input.structure, input.itemTiers);
  if (!items.length) return {};
  const currentLines = observedItemLines({
    structure: input.structure,
    compileResult: input.compileResult,
  });
  const currentTotal = Object.values(currentLines).reduce(
    (total, lines) => total + lines,
    0,
  );
  const lineHeight = Math.max(1, input.compileResult.bodyLineHeightPx);
  const targetHeight = input.compileResult.availableHeightPx *
    RESUME_DEFAULT_TARGET_USAGE_RATIO;
  const additionalLines = Math.ceil(Math.max(
    0,
    targetHeight - input.compileResult.usedHeightPx -
      RESUME_LAYOUT_TOLERANCE_PX,
  ) / lineHeight);
  const totalTargetLines = Math.max(
    items.length,
    currentTotal + additionalLines,
  );
  const allocations = weightedAllocations(items, totalTargetLines);
  return Object.fromEntries(items.map((item) => {
    const targetLines = allocations.get(item.itemId) ?? 1;
    return [item.itemId, {
      tier: item.tier,
      targetLines,
      minimumLines: Math.max(1, targetLines - 1),
    }];
  }));
}

export function observedWorkspaceItemLines(
  workspace: Pick<ResumeWorkspace, "structure" | "compileResult">,
): Record<string, number> {
  return observedItemLines(workspace);
}

function budgetItems(
  structure: ResumeStructure,
  itemTiers: Readonly<Record<string, ResumeItemTier>>,
): BudgetItem[] {
  let order = 0;
  return structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const tier = itemTiers[item.id] ?? (
        section.type === "skills" && item.id !== "item-skills-synthetic"
          ? "utility" : undefined
      );
      return tier ? [{ itemId: item.id, tier, order: order++ }] : [];
    }),
  );
}

function observedItemLines(input: {
  structure: ResumeStructure;
  compileResult: ResumeCompileResult;
}): Record<string, number> {
  const measured = new Map(
    input.compileResult.bullets.map((bullet) => [
      bullet.bulletId,
      bullet.lineCount,
    ]),
  );
  return Object.fromEntries(input.structure.sections.flatMap((section) =>
    section.items.map((item) => [
      item.id,
      item.bullets.reduce(
        (total, bullet) => total + (measured.get(bullet.id) ?? 0),
        0,
      ),
    ]),
  ));
}

function weightedAllocations(
  items: readonly BudgetItem[],
  totalLines: number,
): Map<string, number> {
  const result = new Map(items.map((item) => [item.itemId, 1]));
  const remaining = Math.max(0, totalLines - items.length);
  const weightTotal = items.reduce(
    (total, item) => total + TIER_WEIGHT[item.tier],
    0,
  );
  const shares = items.map((item) => {
    const exact = remaining * TIER_WEIGHT[item.tier] / weightTotal;
    const floor = Math.floor(exact);
    result.set(item.itemId, 1 + floor);
    return { ...item, remainder: exact - floor };
  });
  let undistributed = totalLines - [...result.values()].reduce(
    (total, lines) => total + lines,
    0,
  );
  shares.sort((left, right) =>
    right.remainder - left.remainder ||
    TIER_WEIGHT[right.tier] - TIER_WEIGHT[left.tier] ||
    left.order - right.order
  );
  for (const item of shares) {
    if (undistributed <= 0) break;
    result.set(item.itemId, (result.get(item.itemId) ?? 1) + 1);
    undistributed -= 1;
  }
  return result;
}
