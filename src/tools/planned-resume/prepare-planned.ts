import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { PlannedResumeWriter } from "../../resume/planning/planned-resume-writer.js";
import { buildModelPayload } from "../../resume/workspace/model-payload.js";
import { projectResumeWorkspace } from "../../resume/workspace/workspace-projection.js";

const parameters = Type.Object({
  jdId: Type.String({ minLength: 1 }),
  experienceIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    maxItems: 30,
    description:
      "要纳入简历的有序经历 ID。顺序用于最终展示；必须包含至少一条 education 经历。",
  }),
  language: Type.Union([Type.Literal("zh-CN"), Type.Literal("en-US")]),
  layout: Type.Optional(
    Type.Array(
      Type.Object({
        experienceId: Type.String({ minLength: 1 }),
        bullets: Type.Array(
          Type.Object({
            evidenceIds: Type.Array(Type.String({ minLength: 1 }), {
              minItems: 1,
              maxItems: 3,
            }),
            targetLines: Type.Optional(Type.Integer({ minimum: 1, maximum: 3 })),
          }),
          { minItems: 1 },
        ),
      }),
      {
        minItems: 1,
        description:
          "可选：你自行决定的布局。每条经历若干 bullet，每条 bullet 指定证据 ID 与目标行数；程序只校验预算、证据唯一性与材料上限。不传则程序按默认预算规划。",
      },
    ),
  ),
});

/**
 * Host-orchestrated planned resume creation: the host calibrates the page,
 * plans every bullet (evidence + character target), auto-expands the
 * experience selection when the material is insufficient, then writes all
 * bullets concurrently (one LLM request per bullet). The result is a full
 * evidence-bound workspace the model can keep refining with
 * patch_resume_candidate.
 */
export function createPreparePlannedResumeTool(
  writer: PlannedResumeWriter,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_planned_resume",
    label: "按计划并行生成简历",
    description:
      "宿主按页面预算规划每条 bullet 的证据与字符目标，自动纳入更多经历补充材料，并并行写作全部 bullet；返回完整候选与真实页面预算。本工具不保存简历。",
    parameters,
    execute: async (_toolCallId, params) => {
      const result = await writer.write({
        jdId: params.jdId,
        experienceIds: [...params.experienceIds],
        language: params.language,
        ...(params.layout
          ? { layout: structuredClone(params.layout) }
          : {}),
      });
      const workspace = result.workspace;
      const projection = projectResumeWorkspace(workspace);
      return {
        content: [{ type: "text", text: JSON.stringify(buildModelPayload(workspace)) }],
        details: projection,
      };
    },
  };
}

