import type { TailRepairProgressState } from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";
import { initialMaterialQuestion } from "./material-question.js";
import { createResumeMaterialRequest } from "./material-request.js";

export function workspaceWithTailRepairProgress(
  workspace: ResumeWorkspace,
  tailRepairProgress: TailRepairProgressState,
): ResumeWorkspace {
  if (!tailRepairProgress.stalled) {
    return { ...workspace, tailRepairProgress };
  }
  if (workspace.factNeutralAuthorization) {
    const resumed: ResumeWorkspace = {
      ...workspace,
      status: "needs_revision",
      tailRepairProgress: rearmFinalClosure(tailRepairProgress),
    };
    delete resumed.materialRequest;
    return resumed;
  }
  return {
    ...workspace,
    status: "needs_user_decision",
    tailRepairProgress,
    materialRequest: createResumeMaterialRequest(workspace, {
      kind: "tail_repair_stalled",
      reason: "全部剩余短尾都已耗尽事实增长或两次事实等价展开仍未能安全落地",
      question: initialMaterialQuestion(
        "现有草稿已保留，但剩余内容在现有事实内已经无法继续安全展开。请补充一个尚未写入的具体方法、执行范围、协作对象、交付物或可验证结果；也可以上传旧简历、项目报告、研究材料、模型或汇报 PPT。如果暂时想不到，请直接告诉我，我会根据目标岗位列出具体工作场景帮你一起回忆。",
      ),
      discoveryStage: "guidance",
    }),
  };
}

function rearmFinalClosure(
  progress: TailRepairProgressState,
): TailRepairProgressState {
  return {
    stalled: false,
    byBulletId: Object.fromEntries(Object.entries(progress.byBulletId).map(
      ([bulletId, value]) => [bulletId, {
        ...value,
        mode: "reflow" as const,
        consecutiveRejects: 0,
        reflowAttempts: 0,
      }],
    )),
  };
}
