import type { TailRepairProgressState } from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";

export function workspaceWithTailRepairProgress(
  workspace: ResumeWorkspace,
  tailRepairProgress: TailRepairProgressState,
): ResumeWorkspace {
  if (!tailRepairProgress.stalled) {
    return { ...workspace, tailRepairProgress };
  }
  return {
    ...workspace,
    status: "needs_user_decision",
    tailRepairProgress,
    materialRequest: {
      kind: "tail_repair_stalled",
      reason: "全部未通过尾行已完整轮转三轮，期间没有任何可安全落地的真实进展",
      question: "现有事实经过逐步调整和整句重写后，仍无法在不降低简历门槛的前提下修好全部尾行。请为最相关的一段经历补充一个尚未写入的具体方法、协作范围、项目约束或可验证结果；如果没有更多事实，也请直接说明。",
      requestedAt: new Date().toISOString(),
    },
  };
}
