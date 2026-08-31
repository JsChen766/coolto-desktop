import { createHash } from "node:crypto";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { buildAgentSourceView } from "../../resume/workspace/agent-source-view.js";
import { buildAgentWorkspaceView } from "../../resume/workspace/agent-workspace-view.js";
import { ResumeWorkspaceError } from "../../resume/workspace/errors.js";
import type {
  ResumeSupplementalEvidence,
  ResumeWorkspace,
} from "../../resume/workspace/types.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { applyCriticalSkillGate } from "../../resume/workspace/critical-skill-gate.js";
import { applyBulletCountMaterialGate } from
  "../../resume/workspace/material-request-gate.js";
import { normalizeResumeMaterialRequest } from "../../resume/workspace/material-request.js";
import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { pendingResumeWorkUnitMap } from
  "../../resume/workspace/work-unit-map.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  requestId: Type.Optional(Type.String({ minLength: 1 })),
  experienceId: Type.String({ minLength: 1 }),
  facts: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

export function createAddResumeMaterialTool(
  store: ResumeWorkspaceStore,
  currentUserMessageTimestamp: () => number | undefined,
): AgentTool<typeof parameters> {
  return {
    name: "add_resume_material",
    label: "加入用户补充材料",
    description:
      "把当前用户回答中可核验的事实一次完整加入指定经历。工作区正在追问时必须原样传回 nextAction.requestId。尽量保留背景、方法、对象、数字、产出、结果和结论，不要只提交简历最终采用的少量事实；宿主会把本批事实自动追加到对应 Experience 纯文本正文并创建一个 import revision，不再弹同步确认卡。事实仍会先作为当前 workspace 的 supplemental evidence 使用；随后用 apply_resume_content 批量改写。",
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
      const activeRequest = workspace.materialRequest
        ? normalizeResumeMaterialRequest(workspace.candidateId, workspace.materialRequest)
        : undefined;
      if (activeRequest && params.requestId !== activeRequest.id) {
        throw new Error(`requestId 与当前材料请求不一致：${activeRequest.id}`);
      }
      if (!activeRequest && params.requestId) {
        throw new Error("当前工作区没有可响应的材料请求");
      }
      if (!workspace.sourceSnapshot.experiences.some((item) => item.id === params.experienceId)) {
        throw new Error(`经历 ${params.experienceId} 不在当前工作区`);
      }
      const sourceMessageTimestamp = currentUserMessageTimestamp();
      if (!sourceMessageTimestamp) throw new Error("当前用户消息来源不可用，不能写入补充事实");
      const existing = workspace.supplementalEvidence ?? [];
      const existingFacts = new Set(existing.map((item) => normalized(item.text)));
      const facts = params.facts.map((value) => value.trim());
      if (facts.some((value) => !value)) throw new Error("补充事实不能为空");
      if (new Set(facts.map(normalized)).size !== facts.length) {
        throw new Error("本批次包含重复补充事实");
      }
      if (facts.some((value) => existingFacts.has(normalized(value)))) {
        throw new Error("补充事实已存在于当前工作区");
      }
      const added = facts.map((fact, index): ResumeSupplementalEvidence => ({
        evidenceId: supplementalId(
          workspace.candidateId,
          params.experienceId,
          sourceMessageTimestamp,
          index,
          fact,
        ),
        experienceId: params.experienceId,
        text: fact,
        sourceMessageTimestamp,
        createdAt: new Date().toISOString(),
      }));
      const resumedWorkspace: ResumeWorkspace = {
        ...workspace,
        revision: workspace.revision + 1,
        status: "writing",
        supplementalEvidence: [...existing, ...added],
        ...(workspace.workUnitMap ? {
          workUnitMap: pendingResumeWorkUnitMap(
            workspace.sourceSnapshot.sourceFingerprint,
          ),
        } : {}),
        materialFollowUpPending: {
          sourceRequestKind: activeRequest?.kind ?? "agent_declared",
          targetExperienceId: params.experienceId,
        },
      };
      delete resumedWorkspace.materialRequest;
      delete resumedWorkspace.lineRewriteProgress;
      delete resumedWorkspace.pageFillProgress;
      delete resumedWorkspace.tailRepairProgress;
      delete resumedWorkspace.factNeutralAuthorization;
      delete resumedWorkspace.evidenceAssessment;
      const updated = store.replace(
        applyBulletCountMaterialGate(applyCriticalSkillGate(resumedWorkspace)),
        workspace.revision,
      );
      const payload = {
        ...buildAgentWorkspaceView(updated),
        ...buildAgentSourceView(updated),
        addedEvidence: added.map(({ evidenceId, experienceId, text }) => ({
          evidenceId,
          experienceId,
          text,
        })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: {
          ...payload,
          loopGuardKey: resumeContentProgressKey(updated),
        },
      };
    },
  };
}

function supplementalId(
  candidateId: string,
  experienceId: string,
  timestamp: number,
  index: number,
  fact: string,
): string {
  const digest = createHash("sha256")
    .update(`${candidateId}\0${experienceId}\0${timestamp}\0${index}\0${fact}`)
    .digest("hex")
    .slice(0, 20);
  return `supplemental:${experienceId}:${digest}`;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
