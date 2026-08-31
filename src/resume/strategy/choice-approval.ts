import type { ApprovalManager } from "../../approvals/approval-manager.js";
import type { ActionExecutor } from "../../approvals/executor-registry.js";
import type { ResumeStrategyFallbackDecision } from "./tailored-fallback.js";
import type { ResumeWorkspace } from "../workspace/types.js";

export const RESUME_STRATEGY_CHOICE_ACTION = "resume.strategy.choose";

export function requestResumeStrategyChoice(
  approvals: ApprovalManager,
  workspace: ResumeWorkspace,
  decision: ResumeStrategyFallbackDecision,
) {
  return approvals.request({
    actionType: RESUME_STRATEGY_CHOICE_ACTION,
    scopeKey: `resume-strategy:${workspace.candidateId}`,
    risk: "write",
    title: "这份岗位暂时无法生成可信的针对性简历",
    description:
      "现有经历与这个岗位的匹配度太低，继续改写容易产生弱相关或空泛内容。你可以直接使用通用简历继续投递，或者不继续投递这个岗位。",
    preview: {
      summary: [{ label: "当前结果", value: decision.reason }],
    },
  }, {
    candidateId: workspace.candidateId,
    candidateRevision: workspace.revision,
    options: decision.options,
  });
}

export function createResumeStrategyChoiceExecutor(): ActionExecutor {
  return {
    execute: async () => ({
      summary: "已选择使用通用简历",
      details: { choice: "use_general_resume" },
    }),
    reject: async () => undefined,
  };
}
