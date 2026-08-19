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
      reason: "全部剩余短尾都已耗尽事实增长或两次事实等价展开仍未能安全落地",
      question:
        "现有草稿已保留，但剩余尾行在事实增长和等价展开后仍无法满足单页、行数与尾行门槛。请补充一个尚未写入的具体方法、执行范围、交付物或可验证结果；如果没有更多事实，也请直接说明。",
      requestedAt: new Date().toISOString(),
    },
  };
}
