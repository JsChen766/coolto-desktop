import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import type { ResumeAlternativeRepairer } from "../../resume/quality/alternative-repairer.js";
import type { ResumeAlternativeTargetInput } from "../../resume/quality/types.js";
import type { ResumePatchOperation } from "../../resume/workspace/types.js";
import { projectResumeWorkspace } from "../../resume/workspace/workspace-projection.js";
import {
  alternativeTargetSchema,
  resumePatchOperationSchema,
} from "./schemas.js";

const identity = {
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
};

const parameters = Type.Object({
  ...identity,
  operations: Type.Optional(
    Type.Array(resumePatchOperationSchema, {
      minItems: 1,
      maxItems: 20,
      description:
        "G3 生成期使用的稳定 ID 局部 patch。质量 review 开始后禁止使用。",
    }),
  ),
  alternativeTargets: Type.Optional(
    Type.Array(alternativeTargetSchema, {
      minItems: 1,
      maxItems: 2,
      description:
        "G4 每轮只处理 review 返回的一到两个 target；宿主展开、编译并选择最佳候选。",
    }),
  ),
}, {
  description:
    "operations 与 alternativeTargets 必须且只能提供一个。顶层保持 object，以兼容 DeepSeek/OpenAI function calling。",
});

export function createPatchResumeCandidateTool(
  patcher: ResumeCandidatePatcher,
  repairer: ResumeAlternativeRepairer,
): AgentTool<typeof parameters> {
  return {
    name: "patch_resume_candidate",
    label: "修改简历候选",
    description:
      "像 apply_patch 一样局部增加、替换、删除或移动 bullet。每次成功 patch 都会重新执行 EvidenceLedger 和真实 Chromium 编译，并返回完整前文、JD 覆盖和页面预算。不要提交整份简历或 HTML。",
    parameters,
    execute: async (_toolCallId, params) => {
      const hasOperations = params.operations !== undefined;
      const hasAlternatives = params.alternativeTargets !== undefined;
      if (hasOperations === hasAlternatives) {
        throw new Error(
          "Exactly one of operations or alternativeTargets must be provided.",
        );
      }
      const workspace = params.operations
        ? await patcher.patch({
            candidateId: params.candidateId,
            expectedRevision: params.expectedRevision,
            operations: structuredClone(params.operations) as ResumePatchOperation[],
          })
        : await repairer.repair({
            candidateId: params.candidateId,
            expectedRevision: params.expectedRevision,
            alternativeTargets: structuredClone(
              params.alternativeTargets,
            ) as ResumeAlternativeTargetInput[],
          });
      const projection = projectResumeWorkspace(workspace);
      return {
        content: [{ type: "text", text: JSON.stringify(projection) }],
        details: projection,
      };
    },
  };
}
