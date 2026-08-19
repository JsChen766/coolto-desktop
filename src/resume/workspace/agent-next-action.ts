import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import { resumeGenerationReadiness } from "./generation-readiness.js";
import {
  groundedAdditionTargets,
  type GroundedAdditionTarget,
} from "./grounded-addition-targets.js";
import {
  lineExpansionTargets,
  type LineExpansionTarget,
} from "./line-expansion-targets.js";
import { tailRepairBatch } from "./tail-repair-targets.js";
import { tailGrowthInstruction } from "./tail-repair-instruction.js";
import { TAIL_REFLOW_REQUIRED_EDIT } from "./tail-reflow-instruction.js";
import {
  type TailGrowthFailureType,
} from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";
import { hasPendingAugmentedContent } from "./augmentation-state.js";
import { criticalSkillMaterialRequest } from "./critical-skill-gate.js";
import {
  bulletDepthRewriteTargets,
  MAX_TIERED_BULLET_LINES,
  MIN_TIERED_BULLET_LINES,
  type BulletDepthRewriteTarget,
} from "./bullet-depth-targets.js";
import {
  overflowReductionPlan,
  type OverflowReductionPlan,
} from "./overflow-reduction-plan.js";
import {
  bulletCountRepairPlan,
  type BulletCountRepairTarget,
} from "./bullet-count-repair.js";
const MIN_GROUNDED_ADDITION_OPTIONS = 12;
const MAX_MODEL_TAIL_GROWTH_TARGETS = 4;

interface AgentTailRepairTarget {
  requiredEdit: string;
  bulletId: string;
  currentText: string;
  growthHint: string;
  sourceQuotes: string[];
  rejectedGrowths: string[];
  lastFailureType?: TailGrowthFailureType;
}

interface AgentTailReflowTarget {
  requiredEdit: string;
  bulletId: string;
  currentText: string;
  sourceQuotes: string[];
  rejectedReflows: string[];
}

export type ResumeAgentNextAction =
  | { mode: "stop" }
  | {
    mode: "request_more_material";
    question?: string;
    targetExperienceId?: string;
  }
  | { mode: "await_augmented_confirmation" }
  | ({ mode: "reduce_overflow" } & OverflowReductionPlan)
  | {
    mode: "repair_bullet_counts";
    requiredInput: "items";
    itemIds: string[];
    itemTargets: BulletCountRepairTarget[];
  }
  | {
    mode: "repair_bullet_depth";
    requiredInput: "lineRewrites";
    bulletIds: string[];
    minimumLines: 2;
    maximumLines: 3;
    lineRewriteTargets: BulletDepthRewriteTarget[];
  }
  | {
    mode: "increase_usage";
    additionalBodyLinesToMinimum: number;
    requiredInput:
      | "bulletAdditions"
      | "lineRewrites"
      | "bulletAdditionsOrLineRewrites";
    maximumAddedBullets: number;
    targetExpandedBullets: number;
    groundedAdditionTargets: GroundedAdditionTarget[];
    lineExpansionTargets: LineExpansionTarget[];
  }
  | {
    mode: "batch_tail_repair";
    bulletIds: string[];
    tailRepairTargets: AgentTailRepairTarget[];
    remainingTailCount: number;
    requiredInput: "tailGrowths";
  }
  | {
    mode: "batch_tail_reflow";
    bulletIds: string[];
    tailReflowTargets: AgentTailReflowTarget[];
    remainingTailCount: number;
    requiredInput: "lineRewrites";
  }
  | { mode: "inspect_blockers" };

export function resumeAgentNextAction(
  workspace: ResumeWorkspace,
): ResumeAgentNextAction {
  const criticalSkillRequest = criticalSkillMaterialRequest(workspace);
  if (criticalSkillRequest) {
    return {
      mode: "request_more_material",
      question: criticalSkillRequest.question,
    };
  }
  if (workspace.status === "needs_user_decision") {
    return {
      mode: "request_more_material",
      ...(workspace.materialRequest?.question
        ? { question: workspace.materialRequest.question }
        : {}),
      ...(workspace.materialRequest?.targetExperienceId
        ? { targetExperienceId: workspace.materialRequest.targetExperienceId }
        : {}),
    };
  }
  if (resumeGenerationReadiness(workspace).ready) return { mode: "stop" };

  const compile = workspace.compileResult;
  if (
    compile.pageCount !== 1 ||
    compile.overflowPx > RESUME_LAYOUT_TOLERANCE_PX
  ) return { mode: "reduce_overflow", ...overflowReductionPlan(workspace) };

  const countPlan = bulletCountRepairPlan(workspace);
  if (countPlan.mode === "request_more_material") {
    return {
      mode: "request_more_material",
      question: countPlan.question,
      targetExperienceId: countPlan.targetExperienceId,
    };
  }
  if (countPlan.targets.length) {
    return {
      mode: "repair_bullet_counts",
      requiredInput: "items",
      itemIds: countPlan.targets.map((target) => target.itemId),
      itemTargets: countPlan.targets,
    };
  }

  const depthTargets = bulletDepthRewriteTargets(workspace);
  if (depthTargets.length) {
    return {
      mode: "repair_bullet_depth",
      requiredInput: "lineRewrites",
      bulletIds: depthTargets.map((target) => target.bulletId),
      minimumLines: MIN_TIERED_BULLET_LINES,
      maximumLines: MAX_TIERED_BULLET_LINES,
      lineRewriteTargets: depthTargets,
    };
  }

  const heightDeficitPx = Math.max(
    0,
    compile.availableHeightPx * RESUME_GLOBAL_MINIMUM_USAGE_RATIO -
      compile.usedHeightPx - RESUME_LAYOUT_TOLERANCE_PX,
  );
  if (heightDeficitPx > 0) {
    const targetBodyLines = Math.ceil(
      heightDeficitPx / Math.max(1, compile.bodyLineHeightPx),
    );
    const targets = lineExpansionTargets(workspace);
    const tieredItemIds = new Set(Object.keys(workspace.itemTiers ?? {}));
    const additionTargets = groundedAdditionTargets(
      workspace,
      Math.max(MIN_GROUNDED_ADDITION_OPTIONS, targetBodyLines * 4),
    ).filter((target) => tieredItemIds.has(target.itemId));
    return {
      mode: "increase_usage",
      additionalBodyLinesToMinimum: targetBodyLines,
      requiredInput: additionTargets.length && targets.length
        ? "bulletAdditionsOrLineRewrites"
        : additionTargets.length ? "bulletAdditions" : "lineRewrites",
      maximumAddedBullets: Math.min(targetBodyLines, additionTargets.length),
      groundedAdditionTargets: additionTargets,
      targetExpandedBullets: targets.length,
      lineExpansionTargets: targets,
    };
  }

  const tailBatch = tailRepairBatch(workspace);
  if (tailBatch.remainingTailCount) {
    const activeTargets = tailBatch.targets.filter((target) =>
      !target.exhausted && target.mode === "growth"
    ).slice(0, MAX_MODEL_TAIL_GROWTH_TARGETS);
    if (activeTargets.length) {
      return {
        mode: "batch_tail_repair",
        bulletIds: activeTargets.map((target) => target.bulletId),
        tailRepairTargets: activeTargets.map((target) => ({
          requiredEdit: tailGrowthInstruction(
            target.lastFailureType,
            target.growthHint,
          ),
          bulletId: target.bulletId,
          currentText: target.currentText,
          growthHint: target.growthHint,
          sourceQuotes: target.sourceQuotes,
          rejectedGrowths: target.rejectedGrowths,
          ...(target.lastFailureType
            ? { lastFailureType: target.lastFailureType }
            : {}),
        })),
        remainingTailCount: tailBatch.remainingTailCount,
        requiredInput: "tailGrowths",
      };
    }
    const reflowTargets = tailBatch.targets.filter((target) =>
      !target.exhausted && target.mode === "reflow"
    ).slice(0, MAX_MODEL_TAIL_GROWTH_TARGETS);
    if (reflowTargets.length) {
      return {
        mode: "batch_tail_reflow",
        bulletIds: reflowTargets.map((target) => target.bulletId),
        tailReflowTargets: reflowTargets.map((target) => ({
          requiredEdit: TAIL_REFLOW_REQUIRED_EDIT,
          bulletId: target.bulletId,
          currentText: target.currentText,
          sourceQuotes: target.sourceQuotes,
          rejectedReflows: target.rejectedReflows,
        })),
        remainingTailCount: tailBatch.remainingTailCount,
        requiredInput: "lineRewrites",
      };
    }
  }
  if (hasPendingAugmentedContent(workspace)) {
    return { mode: "await_augmented_confirmation" };
  }
  return { mode: "inspect_blockers" };
}
