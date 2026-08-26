import type { ResumeWorkspace } from "./types.js";
import { createResumeMaterialRequest } from "./material-request.js";

export const MAX_ZERO_GROWTH_ROUNDS = 2;
export type LineRewritePhase = "bullet_depth" | "page_fill";

export function recordLineRewriteOutcome(
  workspace: ResumeWorkspace,
  phase: LineRewritePhase,
  grew: boolean,
): ResumeWorkspace {
  if (grew) return clearLineRewriteProgress(workspace);
  const previous = workspace.lineRewriteProgress;
  const consecutiveZeroGrowthRounds = previous?.phase === phase
    ? previous.consecutiveZeroGrowthRounds + 1
    : 1;
  const lineRewriteProgress = { phase, consecutiveZeroGrowthRounds };
  if (consecutiveZeroGrowthRounds < MAX_ZERO_GROWTH_ROUNDS) {
    return { ...workspace, lineRewriteProgress };
  }
  const depth = phase === "bullet_depth";
  return {
    ...workspace,
    status: "needs_user_decision",
    lineRewriteProgress,
    materialRequest: createResumeMaterialRequest(workspace, {
      kind: "line_rewrite_stalled",
      reason: depth
        ? "bullet 深度阶段连续两轮没有可安全落地的事实增长"
        : "篇幅阶段连续两轮真实测量没有可安全落地的页面增高",
      question: depth
        ? "现有事实连续两轮都无法让短 bullet 达到深度门槛。请补充一个尚未写入的具体方法、执行范围、交付物或可验证结果；如果没有更多事实，也请直接说明。"
        : "现有事实连续两轮都无法让简历安全增加篇幅。请选一段最相关经历，补充尚未写入的具体职责、项目背景、使用的方法或工具、协作范围或可验证结果；如果没有更多事实，也请直接说明。",
    }),
  };
}

export function clearLineRewriteProgress(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  if (!workspace.lineRewriteProgress) return workspace;
  const { lineRewriteProgress: _discarded, ...rest } = workspace;
  void _discarded;
  return rest;
}
