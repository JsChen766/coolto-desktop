import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import type { ResumePatchOperation } from "../../resume/workspace/types.js";
import { projectResumeWorkspace } from "../../resume/workspace/workspace-projection.js";
import { resumePatchOperationSchema } from "./schemas.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  operations: Type.Array(resumePatchOperationSchema, {
    minItems: 1,
    maxItems: 20,
    description:
      "按顺序执行的稳定 ID 局部 patch。任何一步失败时整批不提交。",
  }),
});

export function createPatchResumeCandidateTool(
  patcher: ResumeCandidatePatcher,
): AgentTool<typeof parameters> {
  return {
    name: "patch_resume_candidate",
    label: "修改简历候选",
    description:
      "像 apply_patch 一样局部增加、替换、删除或移动 bullet。每次成功 patch 都会重新执行 EvidenceLedger 和真实 Chromium 编译，并返回完整前文、JD 覆盖和页面预算。不要提交整份简历或 HTML。",
    parameters,
    execute: async (_toolCallId, params) => {
      const workspace = await patcher.patch({
        candidateId: params.candidateId,
        expectedRevision: params.expectedRevision,
        operations: structuredClone(params.operations) as ResumePatchOperation[],
      });
      const projection = projectResumeWorkspace(workspace);
      return {
        content: [{ type: "text", text: JSON.stringify(projection) }],
        details: projection,
      };
    },
  };
}
