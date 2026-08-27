import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { buildAgentWorkspaceReceipt } from "../../resume/workspace/agent-workspace-view.js";
import {
  createResumeMaterialRequest,
  normalizeResumeMaterialRequest,
} from "../../resume/workspace/material-request.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  requestId: Type.Optional(Type.String({ minLength: 1 })),
  resolution: Type.Optional(Type.Union([
    Type.Literal("user_stopped_questions"),
    Type.Literal("best_effort_stalled"),
  ])),
});

export function createDeclineResumeMaterialTool(
  store: ResumeWorkspaceStore,
  currentUserMessageTimestamp: () => number | undefined,
): AgentTool<typeof parameters> {
  return {
    name: "decline_resume_material",
    label: "结束本轮简历生成",
    description:
      "用户明确表示停止追问、接受当前草稿或没有更多事实时调用 resolution=user_stopped_questions；自动写作因运行保护确认无法继续改善时调用 resolution=best_effort_stalled。当前 nextAction 有 requestId 时原样传回；没有材料请求时可省略。保留未达标草稿，不降低质量门槛，并结束本轮自动生成。",
    executionMode: "sequential",
    parameters,
    execute: async (_toolCallId, params) => {
      const workspace = store.get(params.candidateId);
      if (workspace.revision !== params.expectedRevision) {
        throw new Error(
          `expectedRevision=${params.expectedRevision} 与当前 revision=${workspace.revision} 不一致`,
        );
      }
      const resolution = params.resolution ?? "user_stopped_questions";
      const request = workspace.materialRequest
        ? normalizeResumeMaterialRequest(
            workspace.candidateId,
            workspace.materialRequest,
          )
        : normalizeResumeMaterialRequest(
            workspace.candidateId,
            createResumeMaterialRequest(workspace, {
              kind: "agent_declared",
              reason: resolution === "best_effort_stalled"
                ? "自动写作连续没有可靠进展"
                : "用户要求停止材料追问",
              question: "当前简历生成已停止。",
              discoveryStage: "guidance",
            }),
          );
      if (params.requestId && request.id !== params.requestId) {
        throw new Error(`requestId 与当前材料请求不一致：${request.id}`);
      }
      if (request.status === "declined") throw new Error("当前材料请求已经结束");
      const sourceMessageTimestamp = currentUserMessageTimestamp();
      if (resolution === "user_stopped_questions" && !sourceMessageTimestamp) {
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
          resolution,
          respondedAt: new Date().toISOString(),
          ...(sourceMessageTimestamp ? { sourceMessageTimestamp } : {}),
        },
      }, workspace.revision);
      const payload = {
        ...buildAgentWorkspaceReceipt(updated),
        terminalInstruction: resolution === "best_effort_stalled"
          ? "停止工具调用；面向用户只说明自动写作已停止、当前最好草稿已保留且尚未达到交付门槛，不得输出计划、内部状态或提出新的材料问题。"
          : "停止工具调用；面向用户只说明当前草稿因材料不足未达到交付门槛且已保留，不得输出计划、英文过程说明、内部状态或再次提出同一材料问题。",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: { ...payload, loopGuardKey: resumeContentProgressKey(updated) },
      };
    },
  };
}
