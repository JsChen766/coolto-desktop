import type { ResumeWorkspace } from "./types.js";
import { initialMaterialQuestion } from "./material-question.js";

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
  if (workspace.factNeutralAuthorization) {
    return { ...workspace, status: "writing", pageFillProgress: {
      consecutiveZeroGrowthRounds: 0,
    } };
  }
  return {
    ...workspace,
    status: "needs_user_decision",
    pageFillProgress: { consecutiveZeroGrowthRounds },
    materialRequest: {
      kind: "page_fill_stalled",
      reason: "篇幅阶段连续两轮真实测量没有可安全落地的页面增高",
      question: initialMaterialQuestion("现有事实连续两轮都无法让简历安全增加篇幅。继续换说法只会产生空泛内容，因此需要补充一段最相关经历中的具体职责、项目背景、使用的方法或工具、协作范围、交付物或可验证结果。你可以直接描述，也可以上传旧简历、工作总结、项目文档、报告、模型或汇报 PPT；如果暂时想不到，请直接告诉我，我会用该岗位的具体工作场景帮你一起回忆。"),
      discoveryStage: "guidance",
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
