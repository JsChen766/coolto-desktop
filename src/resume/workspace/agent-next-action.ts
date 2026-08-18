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

const MIN_GROUNDED_ADDITION_OPTIONS = 12;

interface AgentTailRepairTarget {
  bulletId: string;
  role: "repair" | "page_balance";
  currentText: string;
  editInstruction: {
    direction: "expand" | "compact" | "hold";
    currentCharacters: number;
    characterDelta: number;
    targetCharacters: number;
  };
  balanceForBulletId?: string;
  requestedLineDelta?: -1 | 1;
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
  | { mode: "repair_bullet_counts"; itemIds: string[] }
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
    requiredInput: "tailRepairs";
    optionLimits: {
      revisedTextsPerTarget: 1;
      augmentedModifiersPerTarget: 1;
    };
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

  const itemIds = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const tier = workspace.itemTiers?.[item.id];
      const minimum = tier === "main" ? 3 : tier === "secondary" ? 2 : 0;
      return item.bullets.length < minimum ? [item.id] : [];
    }),
  );
  if (itemIds.length) return { mode: "repair_bullet_counts", itemIds };

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
    return {
        mode: "batch_tail_repair",
        bulletIds: tailBatch.targets.map((target) => target.bulletId),
        tailRepairTargets: tailBatch.targets.map((target) => ({
          bulletId: target.bulletId,
          role: target.role,
          currentText: target.currentText,
          editInstruction: modelFacingEditInstruction(target),
          ...(target.balanceForBulletId
            ? { balanceForBulletId: target.balanceForBulletId }
            : {}),
          ...(target.requestedLineDelta
            ? { requestedLineDelta: target.requestedLineDelta }
            : {}),
        })),
        remainingTailCount: tailBatch.remainingTailCount,
        requiredInput: "tailRepairs",
        optionLimits: {
          revisedTextsPerTarget: 1,
          augmentedModifiersPerTarget: 1,
        },
      };
  }
  if (hasPendingAugmentedContent(workspace)) {
    return { mode: "await_augmented_confirmation" };
  }
  return { mode: "inspect_blockers" };
}

function modelFacingEditInstruction(
  target: ReturnType<typeof tailRepairBatch>["targets"][number],
): AgentTailRepairTarget["editInstruction"] {
  const currentCharacters = [...target.currentText].length;
  const instruction = target.editInstruction;
  const magnitude = instruction.direction === "hold"
    ? 0
    : Math.ceil(
        (instruction.minimumCharacters + instruction.maximumCharacters) / 2,
      );
  const characterDelta = instruction.direction === "compact"
    ? -magnitude
    : magnitude;
  return {
    direction: instruction.direction,
    currentCharacters,
    characterDelta,
    targetCharacters: Math.max(1, currentCharacters + characterDelta),
  };
}
