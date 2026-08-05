import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import { buildModelPayload } from "../../resume/workspace/model-payload.js";
import { projectResumeWorkspace } from "../../resume/workspace/workspace-projection.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
});

export function createReviewResumeCandidateTool(
  reviewer: ResumeCandidateReviewer,
): AgentTool<typeof parameters> {
  return {
    name: "review_resume_candidate",
    label: "检查简历质量",
    description:
      "仅在 G3 layout_qualified 后调用。执行确定性来源、近重复、责任级别、JD must-have 和最终布局质量门，返回最多两个局部修复目标；不保存简历。",
    parameters,
    execute: async (_toolCallId, params) => {
      const workspace = reviewer.review(
        params.candidateId,
        params.expectedRevision,
      );
      const projection = projectResumeWorkspace(workspace);
      return {
        content: [{ type: "text", text: JSON.stringify(buildModelPayload(workspace)) }],
        details: projection,
      };
    },
  };
}
