import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { buildAgentWorkspaceReceipt } from "../../resume/workspace/agent-workspace-view.js";
import { ResumeWorkspaceError } from "../../resume/workspace/errors.js";
import { scenarioMaterialQuestion } from "../../resume/workspace/material-question.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { resumeWriteResultForModel } from "./resume-write-result-for-model.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  scenarioQuestions: Type.Optional(Type.Array(Type.String({
    minLength: 8,
    maxLength: 240,
  }), { minItems: 1, maxItems: 3 })),
});

const ELIGIBLE_KINDS = new Set([
  "agent_declared", "page_fill_stalled", "line_rewrite_stalled",
  "tail_repair_stalled",
]);

export function createConfirmNoResumeMaterialTool(
  store: ResumeWorkspaceStore,
  currentUserMessageTimestamp: () => number | undefined,
): AgentTool<typeof parameters> {
  return {
    name: "confirm_no_resume_material",
    label: "推进简历素材引导",
    description:
      "用户对首次补充邀约说不需要，或补充完成后明确表示没有更多材料时，不传问题进入最终收尾；这不等于停止生成。只有用户主动希望一起回忆时，才提交 1–3 个具体场景问题。",
    executionMode: "sequential",
    parameters,
    execute: async (_toolCallId, params) => {
      const workspace = store.get(params.candidateId);
      if (workspace.revision !== params.expectedRevision) {
        throw new ResumeWorkspaceError(
          "stale_candidate_revision",
          `Candidate revision changed from ${params.expectedRevision} to ${workspace.revision}.`,
        );
      }
      const request = workspace.materialRequest;
      if (workspace.status !== "needs_user_decision" ||
        !request?.kind || !ELIGIBLE_KINDS.has(request.kind)) {
        throw new Error("当前暂停原因不允许用中性内容代替真实事实");
      }
      const messageTimestamp = currentUserMessageTimestamp();
      if (!messageTimestamp) throw new Error("当前用户消息来源不可用，不能确认无补充事实");
      const updated = request.discoveryStage === "scenario_probe" ||
          !params.scenarioQuestions?.length
        ? authorizeNeutral(workspace, messageTimestamp, params.scenarioQuestions)
        : requestScenarioProbe(
            workspace,
            messageTimestamp,
            params.scenarioQuestions,
          );
      const stored = store.replace(updated, workspace.revision);
      const payload = buildAgentWorkspaceReceipt(stored);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(resumeWriteResultForModel({ ...payload })),
        }],
        details: { ...payload, loopGuardKey: resumeContentProgressKey(stored) },
      };
    },
  };
}

function requestScenarioProbe(
  workspace: ResumeWorkspace,
  messageTimestamp: number,
  scenarioQuestions: readonly string[] | undefined,
): ResumeWorkspace {
  if (!scenarioQuestions) {
    throw new Error("用户希望一起回忆时，必须提交 1–3 个岗位场景问题");
  }
  const revision = workspace.revision + 1;
  return {
    ...workspace,
    revision,
    compileObservedRevision: revision,
    bestSnapshot: { ...workspace.bestSnapshot, revision },
    materialRequest: {
      ...workspace.materialRequest!,
      question: scenarioMaterialQuestion(scenarioQuestions),
      discoveryStage: "scenario_probe",
      firstUnableMessageTimestamp: messageTimestamp,
      scenarioQuestions: [...scenarioQuestions],
    },
  };
}

function authorizeNeutral(
  workspace: ResumeWorkspace,
  messageTimestamp: number,
  scenarioQuestions: readonly string[] | undefined,
): ResumeWorkspace {
  const request = workspace.materialRequest!;
  if (scenarioQuestions?.length) {
    throw new Error("场景追问后只有用户明确表示全部没有时才能授权，第二次调用不要再传问题");
  }
  if (request.discoveryStage === "scenario_probe" &&
    request.firstUnableMessageTimestamp === messageTimestamp) {
    throw new Error("场景问题发出后必须等待用户回答，不能在同一轮自行解锁");
  }
  const kind = request.kind! as
    "agent_declared" | "page_fill_stalled" | "line_rewrite_stalled" |
    "tail_repair_stalled";
  const revision = workspace.revision + 1;
  const updated: ResumeWorkspace = {
    ...workspace,
    revision,
    status: "writing",
    compileObservedRevision: revision,
    bestSnapshot: { ...workspace.bestSnapshot, revision },
    factNeutralAuthorization: {
      sourceRequestKind: kind,
      confirmedAt: new Date().toISOString(),
      confirmedMessageTimestamp: messageTimestamp,
    },
  };
  delete updated.materialRequest;
  delete updated.pageFillProgress;
  delete updated.tailRepairProgress;
  return updated;
}
