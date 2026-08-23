import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { createResumeMaterialRequest } from "../../resume/workspace/material-request.js";
import { buildAgentWorkspaceReceipt } from "../../resume/workspace/agent-workspace-view.js";
import { resumeGenerationReadiness } from "../../resume/workspace/generation-readiness.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  reason: Type.String({ minLength: 1, maxLength: 1000 }),
  question: Type.String({ minLength: 1, maxLength: 500 }),
  targetExperienceId: Type.Optional(Type.String({ minLength: 1 })),
});

export function createPauseResumeForMaterialTool(
  store: ResumeWorkspaceStore,
): AgentTool<typeof parameters> {
  return {
    name: "pause_resume_for_material",
    label: "等待用户补充简历素材",
    description:
      "当你判断现有可靠事实无法继续忠实写作时，保存缺口和一个具体追问并暂停生成。targetExperienceId 只能复制工作区中的真实 sourceExperienceId；不确定时省略，绝不能传 search_experiences 的 exp_N 短引用。调用后停止工具循环，直接向用户提出 question。",
    executionMode: "sequential",
    parameters,
    execute: async (_toolCallId, params) => {
      const reason = params.reason.trim();
      const question = params.question.trim();
      if (!reason || !question) {
        throw new Error("素材不足原因和用户追问均不能为空");
      }
      const workspace = store.get(params.candidateId);
      if (workspace.revision !== params.expectedRevision) {
        throw new Error(
          `expectedRevision=${params.expectedRevision} 与当前 revision=${workspace.revision} 不一致`,
        );
      }
      if (resumeGenerationReadiness(workspace).ready) {
        throw new Error("当前简历已经通过全部门禁，不能进入素材补充状态");
      }
      const requestedExperienceId = params.targetExperienceId?.trim();
      const targetExperienceId = requestedExperienceId &&
          workspace.sourceSnapshot.experiences.some(
            (experience) => experience.id === requestedExperienceId,
          )
        ? requestedExperienceId
        : undefined;
      const revision = workspace.revision + 1;
      const updated = store.replace({
        ...workspace,
        revision,
        status: "needs_user_decision",
        compileObservedRevision: revision,
        bestSnapshot: { ...workspace.bestSnapshot, revision },
        materialRequest: createResumeMaterialRequest(workspace, {
          kind: "agent_declared",
          reason,
          question,
          ...(targetExperienceId ? { targetExperienceId } : {}),
        }),
      }, workspace.revision);
      const payload = buildAgentWorkspaceReceipt(updated);
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: { ...payload, loopGuardKey: resumeContentProgressKey(updated) },
      };
    },
  };
}
