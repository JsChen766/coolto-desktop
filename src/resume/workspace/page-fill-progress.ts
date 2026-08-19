import type { ResumeWorkspace } from "./types.js";

export const MAX_ZERO_GROWTH_ROUNDS = 2;

export function recordPageFillOutcome(
  workspace: ResumeWorkspace,
  grew: boolean,
): ResumeWorkspace {
  if (grew) return clearPageFillProgress(workspace);
  const consecutiveZeroGrowthRounds =
    (workspace.pageFillProgress?.consecutiveZeroGrowthRounds ?? 0) + 1;
  if (consecutiveZeroGrowthRounds < MAX_ZERO_GROWTH_ROUNDS) {
    return { ...workspace, pageFillProgress: { consecutiveZeroGrowthRounds } };
  }
  return {
    ...workspace,
    status: "needs_user_decision",
    pageFillProgress: { consecutiveZeroGrowthRounds },
    materialRequest: {
      kind: "page_fill_stalled",
      reason: "篇幅阶段连续两轮真实测量没有可安全落地的页面增高",
      question: "现有事实连续两轮都无法让简历安全增加篇幅。请选一段最相关经历，补充尚未写入的具体职责、项目背景、使用的方法或工具、协作范围或可验证结果；如果没有更多事实，也请直接说明。",
      requestedAt: new Date().toISOString(),
    },
  };
}

export function clearPageFillProgress(workspace: ResumeWorkspace): ResumeWorkspace {
  if (!workspace.pageFillProgress) return workspace;
  const { pageFillProgress: _discarded, ...rest } = workspace;
  void _discarded;
  return rest;
}
