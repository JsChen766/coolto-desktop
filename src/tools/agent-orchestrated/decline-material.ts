import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { buildAgentWorkspaceReceipt } from "../../resume/workspace/agent-workspace-view.js";
import { normalizeResumeMaterialRequest } from "../../resume/workspace/material-request.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  requestId: Type.String({ minLength: 1 }),
});

export function createDeclineResumeMaterialTool(
  store: ResumeWorkspaceStore,
  currentUserMessageTimestamp: () => number | undefined,
): AgentTool<typeof parameters> {
  return {
    name: "decline_resume_material",
    label: "结束简历材料追问",
    description:
      "仅当用户明确表示没有更多事实或要求停止追问时调用。必须原样传回 nextAction.requestId；保留当前未达标草稿，不降低质量门槛，并结束本轮自动生成。",
    executionMode: "sequential",
    parameters,
    execute: async (_toolCallId, params) => {
      const workspace = store.get(params.candidateId);
      if (workspace.revision !== params.expectedRevision) {
        throw new Error(
          `expectedRevision=${params.expectedRevision} 与当前 revision=${workspace.revision} 不一致`,
        );
      }
      if (!workspace.materialRequest) {
        throw new Error("当前工作区没有可结束的材料请求");
      }
      const request = normalizeResumeMaterialRequest(
        workspace.candidateId,
        workspace.materialRequest,
      );
      if (request.id !== params.requestId) {
        throw new Error(`requestId 与当前材料请求不一致：${request.id}`);
      }
      if (request.status === "declined") throw new Error("当前材料请求已经结束");
      const sourceMessageTimestamp = currentUserMessageTimestamp();
      if (!sourceMessageTimestamp) {
        throw new Error("当前用户消息来源不可用，不能结束材料追问");
      }
      const revision = workspace.revision + 1;
      const updated = store.replace({
        ...workspace,
        revision,
        status: "needs_user_decision",
        compileObservedRevision: revision,
        bestSnapshot: { ...workspace.bestSnapshot, revision },
        materialRequest: {
          ...request,
          status: "declined",
          respondedAt: new Date().toISOString(),
          sourceMessageTimestamp,
        },
      }, workspace.revision);
      const payload = {
        ...buildAgentWorkspaceReceipt(updated),
        terminalInstruction:
          "停止工具调用；面向用户只说明当前草稿因材料不足未达到交付门槛且已保留，不得输出计划、英文过程说明、内部状态或再次提出同一材料问题。",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: { ...payload, loopGuardKey: resumeContentProgressKey(updated) },
      };
    },
  };
}
