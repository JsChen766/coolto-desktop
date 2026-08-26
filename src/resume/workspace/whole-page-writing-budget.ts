import {
  RESUME_DEFAULT_TARGET_USAGE_RATIO,
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import { resolveTailPolicy } from "../tail-policy.js";
import type { ResumeWorkspace } from "./types.js";
import { minimumResumeBulletCount } from "./bullet-count-rules.js";

/** Real-layout capacity for the Agent's next whole-page writing batch. */
export function wholePageWritingBudget(workspace: ResumeWorkspace): object {
  const compile = workspace.compileResult;
  const tailPolicy = resolveTailPolicy(workspace.structure.tail_policy_version);
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
      const minimumBulletCount = minimumResumeBulletCount({
        sectionType: section.type, itemId: item.id, ...(tier ? { tier } : {}),
      });
      if (!minimumBulletCount) return [];
      return [{
        itemId: item.id,
        tier: tier ?? "skills",
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
    formalTailGateRatio: tailPolicy.hardMinRatio,
    preferredTailTargetRatio: tailPolicy.repairSoftMaxRatio,
    linePlanning: {
      minimumLinesPerBullet: 1,
      fixedMaximumLinesPerBullet: null,
      allocationRule:
        "由 Agent 按 JD 匹配度、经历重要性和可用证据深度逐条规划",
    },
    minimumBodyLinesForMinimumBullets: itemMinimums.reduce(
      (total, item) =>
        total + item.minimumBulletCount,
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
