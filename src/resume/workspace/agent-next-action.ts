import { RESUME_LAYOUT_TOLERANCE_PX } from "../compiler-types.js";
import { resumeGenerationReadiness } from "./generation-readiness.js";
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
import { nextFactNeutralRewriteOptions } from
  "./fact-neutral-rewrite-options.js";
import {
  supplementalIntegrationTargets,
  type SupplementalIntegrationTarget,
} from "./supplemental-integration-targets.js";
import {
  itemLineWriteTargets,
  type ItemLineWriteTarget,
} from "./item-line-plan.js";
import type { ResumeMaterialNextAction } from "./material-next-action.js";
import { normalizeResumeMaterialRequest } from "./material-request.js";
import { reuseAdaptationNextAction, type ResumeReuseAdaptationAction } from
  "./reuse-adaptation-next-action.js";
import {
  factNeutralClosureActive,
  hasPendingFirstGenerationGroundedWork,
  isFirstResumeGeneration,
} from "./first-generation-policy.js";
import {
  evidenceAssessmentNextAction,
  type ResumeEvidenceAssessmentAction,
} from "./evidence-assessment.js";
import {
  resumeUsageNextAction,
  type ResumeUsageNextAction,
} from "./usage-next-action.js";
import { workUnitGroupingAction } from "./work-unit-map.js";
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
  | NonNullable<ReturnType<typeof workUnitGroupingAction>>
  | ResumeReuseAdaptationAction | ResumeMaterialNextAction
  | ResumeEvidenceAssessmentAction
  | { mode: "await_augmented_confirmation" }
  | {
    mode: "integrate_supplemental_evidence";
    requiredInput: "items";
    itemIds: string[];
    itemTargets: SupplementalIntegrationTarget[];
  }
  | ({ mode: "reduce_overflow" } & OverflowReductionPlan)
  | {
    mode: "write_item_lines";
    requiredInput: "items";
    itemIds: string[];
    itemTargets: ItemLineWriteTarget[];
  }
  | ResumeUsageNextAction
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
  const workUnitAction = workUnitGroupingAction(workspace);
  const compile = workspace.compileResult;
  if (workUnitAction && workspace.status !== "needs_user_decision" &&
    (compile.pageCount !== 1 ||
    compile.overflowPx > RESUME_LAYOUT_TOLERANCE_PX)) {
    return { mode: "reduce_overflow", ...overflowReductionPlan(workspace) };
  }
  if (workUnitAction && workspace.status !== "needs_user_decision") {
    return workUnitAction;
  }
  const reuseAction = reuseAdaptationNextAction(workspace);
  if (reuseAction) return reuseAction;
  const criticalSkillRequest = criticalSkillMaterialRequest(workspace);
  if (criticalSkillRequest &&
    !hasPendingFirstGenerationGroundedWork(workspace)) {
    const request = normalizeResumeMaterialRequest(
      workspace.candidateId,
      criticalSkillRequest,
    );
    if (request.status === "declined") {
      return {
        mode: "stop_insufficient_material",
        requestId: request.id,
        reason: request.reason,
      };
    }
    return {
      mode: "request_more_material",
      requestId: request.id,
      question: initialMaterialQuestion(criticalSkillRequest.question),
    };
  }
  if (workspace.status === "needs_user_decision") {
    const request = workspace.materialRequest
      ? normalizeResumeMaterialRequest(
          workspace.candidateId,
          workspace.materialRequest,
        )
      : undefined;
    if (request?.status === "declined") {
      return {
        mode: "stop_insufficient_material",
        requestId: request.id,
        reason: request.reason,
      };
    }
    return {
      mode: "request_more_material",
      ...(request ? { requestId: request.id } : {}),
      ...(workspace.materialRequest?.question
        ? { question: workspace.materialRequest.discoveryStage &&
            workspace.materialRequest.discoveryStage !== "guidance"
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
  const evidenceAction = evidenceAssessmentNextAction(workspace);
  if (evidenceAction) return evidenceAction;
  const usageAction = resumeUsageNextAction(workspace);
  if (
    resumeGenerationReadiness(workspace).ready &&
    !(isFirstResumeGeneration(workspace) && usageAction)
  ) return { mode: "stop" };

  if (
    compile.pageCount !== 1 ||
    compile.overflowPx > RESUME_LAYOUT_TOLERANCE_PX
  ) return { mode: "reduce_overflow", ...overflowReductionPlan(workspace) };

  const lineTargets = itemLineWriteTargets(workspace);
  if (lineTargets.length) return itemLineAction(lineTargets);

  if (usageAction) return usageAction;

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
          requiredEdit: factNeutralClosureActive(workspace)
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
          ...(factNeutralClosureActive(workspace)
            ? {
                contentMode: "fact_neutral" as const,
                suggestedNeutralCandidates: nextFactNeutralRewriteOptions({
                  bulletId: target.bulletId,
                  currentText: target.currentText,
                  language: workspace.structure.language,
                  rejected: target.rejectedReflows,
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

function itemLineAction(targets: ItemLineWriteTarget[]) {
  return {
    mode: "write_item_lines" as const,
    requiredInput: "items" as const,
    itemIds: targets.map((target) => target.itemId),
    itemTargets: targets,
  };
}
