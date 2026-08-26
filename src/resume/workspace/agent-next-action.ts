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
import type { TailLengthBudget } from "./tail-length-budget.js";
import type { ResumeWorkspace } from "./types.js";
import { hasPendingAugmentedContent } from "./augmentation-state.js";
import { criticalSkillMaterialRequest } from "./critical-skill-gate.js";
import { initialMaterialQuestion } from "./material-question.js";
import { semanticTailRewriteInstruction } from
  "./semantic-tail-rewrite-instruction.js";
import type { SemanticTailEvidence } from "./semantic-tail-evidence.js";
import {
  overflowReductionPlan,
  type OverflowReductionPlan,
} from "./overflow-reduction-plan.js";
import { FACT_NEUTRAL_REWRITE_INSTRUCTION } from
  "./fact-neutral-rewrite-instruction.js";
import { factNeutralRewriteOptions } from
  "./fact-neutral-rewrite-options.js";
import {
  supplementalIntegrationTargets,
  type SupplementalIntegrationTarget,
} from "./supplemental-integration-targets.js";
import {
  bulletCountRepairPlan,
  type BulletCountRepairTarget,
} from "./bullet-count-repair.js";
const MIN_GROUNDED_ADDITION_OPTIONS = 12;
const MAX_MODEL_TAIL_REWRITE_TARGETS = 4;

interface AgentSemanticTailRewriteTarget {
  requiredEdit: string;
  bulletId: string;
  currentText: string;
  currentLineCount: number;
  currentLastLineRatio: number;
  lengthBudget?: TailLengthBudget;
  sourceQuotes: string[];
  availableEvidence: SemanticTailEvidence[];
  rejectedCandidates: string[];
  contentMode?: "fact_neutral";
  suggestedNeutralCandidates?: string[];
}

export type ResumeAgentNextAction =
  | { mode: "stop" }
  | {
    mode: "request_more_material";
    question?: string;
    targetExperienceId?: string;
  }
  | { mode: "await_augmented_confirmation" }
  | {
    mode: "integrate_supplemental_evidence";
    requiredInput: "items";
    itemIds: string[];
    itemTargets: SupplementalIntegrationTarget[];
  }
  | ({ mode: "reduce_overflow" } & OverflowReductionPlan)
  | {
    mode: "repair_bullet_counts";
    requiredInput: "items";
    itemIds: string[];
    itemTargets: BulletCountRepairTarget[];
  }
  | {
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
  | {
    mode: "batch_tail_rewrite";
    bulletIds: string[];
    tailRewriteTargets: AgentSemanticTailRewriteTarget[];
    remainingTailCount: number;
    requiredInput: "tailRewrites";
  }
  | { mode: "inspect_blockers" };

export function resumeAgentNextAction(
  workspace: ResumeWorkspace,
): ResumeAgentNextAction {
  const criticalSkillRequest = criticalSkillMaterialRequest(workspace);
  if (criticalSkillRequest) {
    return {
      mode: "request_more_material",
      question: initialMaterialQuestion(criticalSkillRequest.question),
    };
  }
  if (workspace.status === "needs_user_decision") {
    return {
      mode: "request_more_material",
      ...(workspace.materialRequest?.question
        ? { question: workspace.materialRequest.discoveryStage ===
            "scenario_probe"
            ? workspace.materialRequest.question
            : initialMaterialQuestion(workspace.materialRequest.question) }
        : {}),
      ...(workspace.materialRequest?.targetExperienceId
        ? { targetExperienceId: workspace.materialRequest.targetExperienceId }
        : {}),
    };
  }
  const supplementalTargets = supplementalIntegrationTargets(workspace);
  if (supplementalTargets.length) {
    return {
      mode: "integrate_supplemental_evidence",
      requiredInput: "items",
      itemIds: supplementalTargets.map((target) => target.itemId),
      itemTargets: supplementalTargets,
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
      question: initialMaterialQuestion(countPlan.question),
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
    const neutralAuthorized = Boolean(workspace.factNeutralAuthorization);
    return {
      mode: "increase_usage",
      additionalBodyLinesToMinimum: targetBodyLines,
      requiredInput: !neutralAuthorized && additionTargets.length && targets.length
        ? "bulletAdditionsOrLineExpansions"
        : !neutralAuthorized && additionTargets.length
          ? "bulletAdditions" : "lineExpansions",
      maximumAddedBullets: neutralAuthorized
        ? 0 : Math.min(targetBodyLines, additionTargets.length),
      groundedAdditionTargets: neutralAuthorized ? [] : additionTargets,
      targetExpandedBullets: targets.length,
      lineExpansionTargets: targets,
    };
  }

  const tailBatch = tailRepairBatch(workspace);
  if (tailBatch.remainingTailCount) {
    const activeTargets = tailBatch.targets.filter((target) =>
      !target.exhausted
    ).slice(0, MAX_MODEL_TAIL_REWRITE_TARGETS);
    if (activeTargets.length) {
      return {
        mode: "batch_tail_rewrite",
        bulletIds: activeTargets.map((target) => target.bulletId),
        tailRewriteTargets: activeTargets.map((target) => ({
          requiredEdit: workspace.factNeutralAuthorization
            ? FACT_NEUTRAL_REWRITE_INSTRUCTION
            : semanticTailRewriteInstruction(target.lengthBudget),
          bulletId: target.bulletId,
          currentText: target.currentText,
          currentLineCount: target.currentLineCount,
          currentLastLineRatio: target.currentLastLineRatio,
          ...(target.lengthBudget
            ? { lengthBudget: target.lengthBudget }
            : {}),
          sourceQuotes: target.sourceQuotes,
          availableEvidence: target.availableEvidence,
          rejectedCandidates: target.rejectedReflows,
          ...(workspace.factNeutralAuthorization
            ? {
                contentMode: "fact_neutral" as const,
                suggestedNeutralCandidates: factNeutralRewriteOptions({
                  bulletId: target.bulletId,
                  currentText: target.currentText,
                  language: workspace.structure.language,
                  ...(target.lengthBudget
                    ? { budget: target.lengthBudget } : {}),
                }),
              }
            : {}),
        })),
        remainingTailCount: tailBatch.remainingTailCount,
        requiredInput: "tailRewrites",
      };
    }
  }
  if (hasPendingAugmentedContent(workspace)) {
    return { mode: "await_augmented_confirmation" };
  }
  return { mode: "inspect_blockers" };
}
