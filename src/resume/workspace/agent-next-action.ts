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
import {
  bulletCountRepairPlan,
  type BulletCountRepairTarget,
} from "./bullet-count-repair.js";
const MIN_GROUNDED_ADDITION_OPTIONS = 12;
const MAX_MODEL_TAIL_REPAIR_TARGETS = 8;

interface AgentTailRepairTarget {
  requiredEdit: string;
  bulletId: string;
  currentText: string;
  currentLineCount: number;
  expansionGoal: string;
  concreteExpansionHints: string[];
  sourceQuotes: string[];
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
    requiredInput: "tailRepairs";
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
    const activeTargets = tailBatch.targets.slice(0, MAX_MODEL_TAIL_REPAIR_TARGETS);
    return {
      mode: "batch_tail_repair",
      bulletIds: activeTargets.map((target) => target.bulletId),
      tailRepairTargets: activeTargets.map((target) => ({
        requiredEdit: tailRepairInstruction(
          target.zeroProgressRounds,
          target.expansionGoal,
          target.currentLineCount,
        ),
        bulletId: target.bulletId,
        currentText: target.currentText,
        currentLineCount: target.currentLineCount,
        expansionGoal: target.expansionGoal,
        concreteExpansionHints: target.concreteExpansionHints,
        sourceQuotes: target.sourceQuotes,
      })),
      remainingTailCount: tailBatch.remainingTailCount,
      requiredInput: "tailRepairs",
    };
  }
  if (hasPendingAugmentedContent(workspace)) {
    return { mode: "await_augmented_confirmation" };
  }
  return { mode: "inspect_blockers" };
}

export function tailRepairInstruction(
  zeroProgressRounds: number,
  expansionGoal = "补充一个具体方法、行动细节或证据支持的结果",
  currentLineCount = 2,
): string {
  const retry = zeroProgressRounds > 0
    ? "上一版未通过实测；请重组整句，把具体事实自然融入动作链，不要只在句尾追加抽象总结。"
    : "";
  return `${retry}基于 currentText 自然重写为唯一完整 bullet，本轮语义目标：${expansionGoal}。保持 currentText 当前实测的 ${currentLineCount} 行，不要增加或减少行数；无需计算字符或像素，宿主会用 Chromium 实测。先判断“必要背景、专业方法、具体行动、可验证结果”中哪个有来源但尚未表达，再把该环节自然融入成果链；来源缺少的环节可以省略。优先使用 concreteExpansionHints 或 sourceQuotes 支持的方法、对象、范围或交付物，保留原有事实、数字、对象和结果；不得编造或添加抽象结论。只提交一个 revisedText，禁止候选和多版本。`;
}
