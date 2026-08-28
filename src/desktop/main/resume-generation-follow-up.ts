import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { resumeAgentNextAction } from "../../resume/workspace/agent-next-action.js";
import { resumeGenerationReadiness } from "../../resume/workspace/generation-readiness.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { OutputRepetitionReason } from
  "../../agent/output-repetition-guard.js";
import type { TurnGovernorStopReason } from "../../agent/turn-governor.js";
import { hasNoMoreResumeMaterialIntent } from "./no-material-intent.js";

export interface ResumeOutputRecoveryInput {
  reason: OutputRepetitionReason;
  candidateId: string;
  revision: number;
  nextAction: object;
}

/** Lets Pi resume once after a text-only planning turn at each measured state. */
export function createResumeGenerationFollowUp(
  store: ResumeWorkspaceStore,
  currentUserMessageTimestamp: () => number | undefined = () => undefined,
  currentUserMessageText: () => string | undefined = () => undefined,
): (promptSequence: number, message: AgentMessage) =>
  string | { instruction: string; requireToolCall: boolean } | undefined {
  let lastQueuedKey: string | undefined;
  return (promptSequence, message) => {
    const workspace = store.latest();
    if (!workspace) return undefined;
    const action = resumeAgentNextAction(workspace);
    const noMoreMaterial = hasNoMoreResumeMaterialIntent(
      currentUserMessageText(),
    );
    if (
      resumeGenerationReadiness(workspace).ready ||
      action.mode === "stop" ||
      action.mode === "await_augmented_confirmation"
    ) return undefined;
    const reopenStalledClosure = noMoreMaterial &&
      workspace.materialRequest?.status === "declined" &&
      workspace.materialRequest.resolution === "best_effort_stalled";
    if (action.mode === "stop_insufficient_material" ||
      (action.mode === "inspect_blockers" && reopenStalledClosure)) {
      if (!reopenStalledClosure) return undefined;
      const key = `${promptSequence}:${resumeContentProgressKey(workspace)}:reopen`;
      if (key === lastQueuedKey) return undefined;
      lastQueuedKey = key;
      return {
        instruction: [
          "当前真实用户消息明确没有更多材料并要求继续完成；既有 best_effort_stalled 不能吞掉这次继续指令。",
          "第一项输出必须调用且只调用 confirm_no_resume_material，不传 scenarioQuestions，以重新开放最终收尾；不得创建新工作区、再次 decline 或输出纯文本解释。",
          `candidateId=${workspace.candidateId}`,
          `expectedRevision=${workspace.revision}`,
        ].join("\n"),
        requireToolCall: true,
      };
    }
    if (action.mode === "request_more_material") {
      const request = workspace.materialRequest;
      const userTimestamp = currentUserMessageTimestamp();
      const requestPredatesUser = Boolean(
        request && userTimestamp &&
        Date.parse(request.requestedAt) <= userTimestamp,
      );
      return noMoreMaterial || requestPredatesUser ? {
            instruction: [
              noMoreMaterial
                ? "当前真实用户消息已明确没有更多材料，不能再次显示或改写材料问题。"
                : "当前真实用户消息正在回答一个既有材料边界，但上一条回复没有用工具落实用户决定。",
              "第一项输出必须根据用户原话调用且只调用一个工具：补充事实用 add_resume_material；不需要补充或没有更多事实用 confirm_no_resume_material 进入最终收尾；只有明确停止整份生成或接受未达标草稿才用 decline_resume_material。",
              `candidateId=${workspace.candidateId}`,
              `expectedRevision=${workspace.revision}`,
              ...(action.requestId ? [`requestId=${action.requestId}`] : []),
              "不得再次输出纯文本确认，也不得换一种说法追问。",
            ].join("\n"),
            requireToolCall: true,
          } : undefined;
    }
    const key = `${promptSequence}:${resumeContentProgressKey(workspace)}`;
    if (key === lastQueuedKey) return undefined;
    lastQueuedKey = key;
    return [
      "上一条回复只是未执行的中间计划，当前简历工作区仍未达到机械完成条件。",
      `最新 nextAction.mode=${action.mode}。`,
      "不要重复或展示计划；仅当最近回执仍与用户当前指令一致时，立即发起一次最合适的批量工具调用继续。",
      "如果没有任何安全工具操作，第一项输出必须调用 decline_resume_material：" +
        `candidateId=${workspace.candidateId}; expectedRevision=${workspace.revision}; ` +
        "resolution=best_effort_stalled。自动 follow-up 本身不得产生新的材料问题。",
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
    if (action.mode === "request_more_material") {
      return [
        `运行保护原因=${reason}。停止工具循环。`,
        "先检查最近真实用户消息；若用户只是不需要补充、没有更多材料或要求按现有信息继续，第一项输出必须调用 confirm_no_resume_material 且不传场景问题，进入最终收尾。只有用户明确停止整份生成或接受未达标草稿时才调用 decline_resume_material。否则只显示以下一个权威问题：",
        action.question ?? materialStallQuestion(),
      ].join("\n");
    }
    return [
      `运行保护原因=${reason}。现有自动写作已连续没有可靠进展，不要重试原工具。`,
      "运行保护本身不得向用户索取材料。第一项输出必须调用 decline_resume_material，参数如下：",
      `candidateId=${workspace.candidateId}`,
      `expectedRevision=${workspace.revision}`,
      "resolution=best_effort_stalled",
      "工具成功后只说明自动写作已停止、当前最好草稿已保留且尚未达到交付门槛；不得提出新的材料问题。",
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
      "若最近真实用户消息只是不需要补充或没有更多材料，第一项输出必须调用 confirm_no_resume_material 且不传场景问题；只有明确停止整份生成时才调用 decline_resume_material。否则只提出以下一个权威问题，不得补充新的问题、计划或解释：",
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
