import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { resumeAgentNextAction } from "../../resume/workspace/agent-next-action.js";
import { resumeGenerationReadiness } from "../../resume/workspace/generation-readiness.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import type { OutputRepetitionReason } from
  "../../agent/output-repetition-guard.js";
import type { TurnGovernorStopReason } from "../../agent/turn-governor.js";

export interface ResumeOutputRecoveryInput {
  reason: OutputRepetitionReason;
  candidateId: string;
  revision: number;
  nextAction: object;
}

/** Lets Pi resume once after a text-only planning turn at each measured state. */
export function createResumeGenerationFollowUp(
  store: ResumeWorkspaceStore,
): (promptSequence: number) => string | undefined {
  let lastQueuedKey: string | undefined;
  return (promptSequence) => {
    const workspace = store.latest();
    if (!workspace || workspace.status === "needs_user_decision") return undefined;
    const action = resumeAgentNextAction(workspace);
    if (
      resumeGenerationReadiness(workspace).ready ||
      action.mode === "stop" ||
      action.mode === "await_augmented_confirmation"
    ) return undefined;
    const key = `${promptSequence}:${resumeContentProgressKey(workspace)}`;
    if (key === lastQueuedKey) return undefined;
    lastQueuedKey = key;
    return [
      "上一条回复只是未执行的中间计划，当前简历工作区仍未达到机械完成条件。",
      `最新 nextAction.mode=${action.mode}。`,
      "不要重复或展示计划；立即按最近回执的 nextAction 发起一次最合适的批量工具调用继续。",
      "如果没有任何安全的工具操作且确实缺少用户事实，则直接向用户提出一个具体问题。",
    ].join("\n");
  };
}

export function createResumeOutputRepetitionRecovery(
  store: ResumeWorkspaceStore,
): (promptSequence: number, reason: OutputRepetitionReason) =>
  string | undefined {
  return (_promptSequence, reason) => {
    const workspace = store.latest();
    if (!workspace) return undefined;
    return buildResumeOutputRecoveryInstruction({
      reason,
      candidateId: workspace.candidateId,
      revision: workspace.revision,
      nextAction: resumeAgentNextAction(workspace),
    });
  };
}

export function createResumeTurnGovernorRecovery(
  store: ResumeWorkspaceStore,
): (promptSequence: number, reason: TurnGovernorStopReason) =>
  string | undefined {
  return (_promptSequence, reason) => {
    const workspace = store.latest();
    if (!workspace) {
      return [
        `运行保护原因=${reason}。简历工作区尚未创建，禁止重复上一项检索工具。`,
        "若上一项是 search_jds，绝对不得再次调用 search_jds；第一项输出必须用最近结果中公司和岗位名称精确匹配的第一条 ID 调用 get_jd，同名重复记录无需用户消歧。随后继续一次关键词经历检索和一次全库经历检索。只有可读公司或岗位名称实质不同才询问用户一次；不得输出内部计划、ID 或重试说明。",
      ].join("\n");
    }
    if (resumeGenerationReadiness(workspace).ready) {
      return undefined;
    }
    const action = resumeAgentNextAction(workspace);
    if (workspace.factNeutralAuthorization) {
      return [
        `运行保护原因=${reason}。用户已经完成场景追问并确认没有更多事实，禁止再次调用 pause_resume_for_material 或重复追问素材。`,
        `candidateId=${workspace.candidateId}`,
        `expectedRevision=${workspace.revision}`,
        `权威 nextAction.mode=${action.mode}`,
        "第一项输出必须是依据最近工具回执的批量工具调用。若为 batch_tail_rewrite，逐字复制每个目标的 suggestedNeutralCandidates，一次覆盖全部 bulletIds，并继续服从后续 nextAction，直到合格或宿主返回明确错误；不得输出可见计划或逐字分析。",
      ].join("\n");
    }
    if (action.mode === "request_more_material") {
      return [
        `运行保护原因=${reason}。停止工具循环。`,
        "只向用户显示以下权威素材问题，不得输出内部状态或计划：",
        action.question ?? materialStallQuestion(),
      ].join("\n");
    }
    return [
      `运行保护原因=${reason}。现有自动写作已连续没有可靠进展，不要重试原工具。`,
      "第一项输出必须调用 pause_resume_for_material，参数如下：",
      `candidateId=${workspace.candidateId}`,
      `expectedRevision=${workspace.revision}`,
      "reason=自动写作连续没有可靠进展，现有事实不足以安全完成当前篇幅或版面修复",
      `question=${materialStallQuestion()}`,
      "工具成功后只向用户显示 question；不得要求用户理解或指定任何内部工具。",
    ].join("\n");
  };
}

function materialStallQuestion(): string {
  return "当前草稿在现有事实内已经无法继续安全改善。请从与目标岗位最相关的一段经历中，补充尚未写入的职责、项目背景、方法或工具、协作范围、交付物或可验证结果；你也可以上传旧简历、工作总结、项目文档、研究报告、模型或汇报 PPT。如果暂时想不到，请直接告诉我，我会用该岗位的具体工作场景帮你一起回忆。";
}

export function buildResumeOutputRecoveryInstruction(
  input: ResumeOutputRecoveryInput,
): string {
  const action = input.nextAction as {
    mode?: unknown;
    question?: unknown;
    bulletIds?: unknown;
    tailRewriteTargets?: unknown;
  };
  const reason = input.reason === "narrative_limit"
    ? "上一响应因可见说明超过限制被删除。"
    : "上一响应因可见内容连续循环被删除。";
  if (action.mode === "request_more_material") {
    return [
      reason,
      "停止工具循环，只向用户提出以下权威问题，不得补充计划或解释：",
      typeof action.question === "string"
        ? action.question
        : "请补充一个尚未写入的具体事实。",
    ].join("\n");
  }
  const targetSummary = compactTailTargetSummary(action);
  return [
    reason,
    `candidateId=${input.candidateId}`,
    `expectedRevision=${input.revision}`,
    `权威 nextAction.mode=${String(action.mode ?? "unknown")}`,
    ...(targetSummary ? [targetSummary] : []),
    "第一项输出必须是工具调用；复用最近工具回执中的完整目标，严格使用 requiredInput 一次覆盖全部 bulletIds，不得先输出任何可见文字、候选解释或逐字分析。",
  ].join("\n");
}

function compactTailTargetSummary(action: {
  bulletIds?: unknown;
  tailRewriteTargets?: unknown;
}): string | undefined {
  if (!Array.isArray(action.bulletIds)) return undefined;
  const targets = Array.isArray(action.tailRewriteTargets)
    ? action.tailRewriteTargets : [];
  const currentTextById = new Map(targets.flatMap((target) => {
    if (!target || typeof target !== "object") return [];
    const value = target as { bulletId?: unknown; currentText?: unknown };
    return typeof value.bulletId === "string" &&
        typeof value.currentText === "string"
      ? [[value.bulletId, value.currentText] as const] : [];
  }));
  return action.bulletIds.flatMap((id) => typeof id === "string"
    ? [`${id}: currentText=${currentTextById.get(id) ?? "见最近工具回执"}`]
    : []).join("\n");
}
