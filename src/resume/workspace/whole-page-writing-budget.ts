import {
  RESUME_DEFAULT_TARGET_USAGE_RATIO,
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import type { ResumeWorkspace } from "./types.js";
import {
  MAX_TIERED_BULLET_LINES,
  MIN_TIERED_BULLET_LINES,
} from "./bullet-depth-targets.js";

/** Real-layout capacity for the Agent's next whole-page writing batch. */
export function wholePageWritingBudget(workspace: ResumeWorkspace): object {
  const compile = workspace.compileResult;
  const lineHeight = Math.max(1, compile.bodyLineHeightPx);
  const minimumBodyLinesToAdd = linesToRatio(
    compile.usedHeightPx,
    compile.availableHeightPx,
    lineHeight,
    RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
    RESUME_LAYOUT_TOLERANCE_PX,
  );
  const preferredBodyLinesToAdd = linesToRatio(
    compile.usedHeightPx,
    compile.availableHeightPx,
    lineHeight,
    RESUME_DEFAULT_TARGET_USAGE_RATIO,
    0,
  );
  const itemMinimums = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const tier = workspace.itemTiers?.[item.id];
      if (!tier) return [];
      const minimumBulletCount = tier === "main" ? 3 : tier === "secondary" ? 2 : 0;
      return [{
        itemId: item.id,
        tier,
        currentBulletCount: item.bullets.length,
        minimumBulletCount,
        remainingMinimumBullets: Math.max(
          0,
          minimumBulletCount - item.bullets.length,
        ),
      }];
    }),
  );
  return {
    basis: "current_real_chromium_layout",
    currentUsageRatio: compile.usageRatio,
    minimumLinesPerTieredBullet: MIN_TIERED_BULLET_LINES,
    maximumLinesPerTieredBullet: MAX_TIERED_BULLET_LINES,
    minimumBodyLinesForMinimumBullets: itemMinimums.reduce(
      (total, item) =>
        total + item.minimumBulletCount * MIN_TIERED_BULLET_LINES,
      0,
    ),
    minimumBodyLinesToAdd,
    preferredBodyLinesToAdd,
    maximumBodyLinesToAdd: Math.floor(
      Math.max(0, compile.availableHeightPx - compile.usedHeightPx) / lineHeight,
    ),
    remainingMinimumBullets: itemMinimums.reduce(
      (total, item) => total + item.remainingMinimumBullets,
      0,
    ),
    itemMinimums,
  };
}

function linesToRatio(
  usedHeightPx: number,
  availableHeightPx: number,
  lineHeightPx: number,
  ratio: number,
  tolerancePx: number,
): number {
  return Math.ceil(Math.max(
    0,
    availableHeightPx * ratio - usedHeightPx - tolerancePx,
  ) / lineHeightPx);
}
