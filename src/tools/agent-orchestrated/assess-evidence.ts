import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { resumeContentProgressKey } from
  "../../resume/workspace/agent-progress-key.js";
import { buildAgentWorkspaceReceipt } from
  "../../resume/workspace/agent-workspace-view.js";
import { applyEvidenceAssessment } from
  "../../resume/workspace/evidence-assessment.js";
import { ResumeWorkspaceStore } from
  "../../resume/workspace/workspace-store.js";
import { resumeWriteResultForModel } from "./resume-write-result-for-model.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  round: Type.Union([Type.Literal(1), Type.Literal(2)]),
  decisions: Type.Array(Type.Object({
    evidenceId: Type.String({ minLength: 1 }),
    status: Type.Union([
      Type.Literal("selected"),
      Type.Literal("deferred"),
      Type.Literal("excluded_duplicate"),
      Type.Literal("excluded_invalid"),
    ]),
    reasonCode: Type.String({ minLength: 3, maxLength: 120 }),
  }), { minItems: 1, maxItems: 24 }),
});

export function createAssessResumeEvidenceTool(
  store: ResumeWorkspaceStore,
): AgentTool<typeof parameters> {
  return {
    name: "assess_resume_evidence",
    label: "复评简历证据",
    description:
      "用户确认没有更多材料后执行两轮有限复评。第 1 轮选择可迁移、弱相关但有用的事实；第 2 轮进一步降低标准，除重复或无效外的真实独立事实都必须 selected，并按最近经历优先。",
    executionMode: "sequential",
    parameters,
    execute: async (_toolCallId, params) => {
      const current = store.get(params.candidateId);
      if (current.revision !== params.expectedRevision) {
        throw new Error(
          `expectedRevision=${params.expectedRevision} 与当前 revision=${current.revision} 不一致`,
        );
      }
      const updated = applyEvidenceAssessment(
        current,
        params.round,
        params.decisions,
      );
      const stored = store.replace(updated, current.revision);
      const payload = buildAgentWorkspaceReceipt(stored);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(resumeWriteResultForModel({ ...payload })),
        }],
        details: {
          ...payload,
          loopGuardKey: resumeContentProgressKey(stored),
          turnGovernorPhaseKey: "resume_evidence_reassessment",
        },
      };
    },
  };
}
