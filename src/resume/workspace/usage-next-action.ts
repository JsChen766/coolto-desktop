import {
  RESUME_DEFAULT_TARGET_USAGE_RATIO,
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import {
  factNeutralClosureActive,
  isFirstResumeGeneration,
} from "./first-generation-policy.js";
import {
  groundedAdditionTargets,
  type GroundedAdditionTarget,
} from "./grounded-addition-targets.js";
import {
  lineExpansionTargets,
  type LineExpansionTarget,
} from "./line-expansion-targets.js";
import type { ResumeWorkspace } from "./types.js";
import { observedWorkspaceItemLines } from "./item-line-budget.js";

const MIN_GROUNDED_ADDITION_OPTIONS = 12;

export interface ResumeUsageNextAction {
  mode: "increase_usage";
  additionalBodyLinesToMinimum: number;
  requiredInput:
    | "bulletAdditions"
    | "lineExpansions"
    | "bulletAdditionsOrLineExpansions";
  maximumAddedBullets: number;
  targetExpandedBullets: number;
  groundedAdditionTargets: GroundedAdditionTarget[];
  lineExpansionTargets: LineExpansionTarget[];
}

export function resumeUsageNextAction(
  workspace: ResumeWorkspace,
): ResumeUsageNextAction | undefined {
  const compile = workspace.compileResult;
  if (compile.pageCount !== 1 ||
    compile.overflowPx > RESUME_LAYOUT_TOLERANCE_PX) return undefined;
  const firstGeneration = isFirstResumeGeneration(workspace);
  const targetRatio = firstGeneration
    ? RESUME_DEFAULT_TARGET_USAGE_RATIO
    : RESUME_GLOBAL_MINIMUM_USAGE_RATIO;
  const heightDeficitPx = Math.max(
    0,
    compile.availableHeightPx * targetRatio - compile.usedHeightPx -
      RESUME_LAYOUT_TOLERANCE_PX,
  );
  if (heightDeficitPx <= 0) return undefined;
  const targetBodyLines = Math.ceil(
    heightDeficitPx / Math.max(1, compile.bodyLineHeightPx),
  );
  const targets = lineExpansionTargets(workspace);
  const tieredItemIds = new Set(Object.keys(workspace.itemTiers ?? {}));
  const observedLines = observedWorkspaceItemLines(workspace);
  const additionTargets = groundedAdditionTargets(
    workspace,
    Math.max(MIN_GROUNDED_ADDITION_OPTIONS, targetBodyLines * 4),
  ).filter((target) =>
    tieredItemIds.has(target.itemId) &&
    (
      workspace.lineBudgetVersion !== "item-lines-v1" ||
      (observedLines[target.itemId] ?? 0) <
        (workspace.itemLineBudgets?.[target.itemId]?.targetLines ?? 0)
    )
  );
  const neutralActive = factNeutralClosureActive(workspace);
  return {
    mode: "increase_usage",
    additionalBodyLinesToMinimum: targetBodyLines,
    requiredInput: targets.length
      ? "lineExpansions"
      : !neutralActive && additionTargets.length
        ? "bulletAdditions" : "lineExpansions",
    maximumAddedBullets: neutralActive
      ? 0 : Math.min(targetBodyLines, additionTargets.length),
    groundedAdditionTargets: neutralActive ? [] : additionTargets,
    targetExpandedBullets: targets.length,
    lineExpansionTargets: targets,
  };
}
