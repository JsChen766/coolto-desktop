import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumeCandidatePreparer } from "../../resume/workspace/candidate-preparer.js";
import type { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import { projectResumeWorkspace } from "../../resume/workspace/workspace-projection.js";
import { evidenceBindingSchema } from "./schemas.js";

const parameters = Type.Object({
  jdId: Type.String({ minLength: 1 }),
  experienceIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    maxItems: 30,
    description:
      "要纳入简历的有序经历 ID。顺序用于最终展示；必须包含至少一条 education 经历。",
  }),
  language: Type.Union([Type.Literal("zh-CN"), Type.Literal("en-US")]),
  initialBindings: Type.Optional(
    Type.Array(evidenceBindingSchema, { maxItems: 30 }),
  ),
});

export function createPrepareResumeCandidateTool(
  preparer: ResumeCandidatePreparer,
  reviewer?: ResumeCandidateReviewer,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_resume_candidate",
    label: "创建简历候选",
    description:
      "在目标 JD 和有序经历范围确定后创建当前任务内存中的简历 Workspace，注入固定 header/栏目/经历元数据，校验可选首批 bullet 的原文证据，并用 Chromium 返回真实页面预算。本工具不保存简历。",
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const prepared = await preparer.prepare(
        {
          jdId: params.jdId,
          experienceIds: [...params.experienceIds],
          language: params.language,
          ...(params.initialBindings
            ? { initialBindings: structuredClone(params.initialBindings) }
            : {}),
        },
        signal,
      );
      const workspace = reviewQualifiedCandidate(prepared, reviewer);
      const projection = projectResumeWorkspace(workspace);
      return {
        content: [{ type: "text", text: JSON.stringify(projection) }],
        details: projection,
      };
    },
  };
}

function reviewQualifiedCandidate(
  workspace: ResumeWorkspace,
  reviewer: ResumeCandidateReviewer | undefined,
): ResumeWorkspace {
  if (!reviewer || workspace.status !== "layout_qualified") return workspace;
  return reviewer.review(workspace.candidateId, workspace.revision);
}
