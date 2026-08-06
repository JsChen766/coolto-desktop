import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumeLayoutInspector } from "../../resume/planning/layout-inspector.js";

const parameters = Type.Object({
  jdId: Type.String({ minLength: 1 }),
  experienceIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    maxItems: 30,
    description:
      "要纳入简历的有序经历 ID。顺序用于最终展示；必须包含至少一条 education 经历。",
  }),
  language: Type.Union([Type.Literal("zh-CN"), Type.Literal("en-US")]),
});

/**
 * Read-only layout context for the agent: hard budget numbers (total line
 * budget, chars per line, material ceiling) and per-experience evidence
 * candidates with their JD hits. The agent decides the layout itself and
 * passes it back to prepare_planned_resume.
 */
export function createInspectResumeLayoutTool(
  inspector: ResumeLayoutInspector,
): AgentTool<typeof parameters> {
  return {
    name: "inspect_resume_layout",
    label: "查看简历篇幅预算与证据",
    description:
      "只读：返回一页简历的硬预算（总行数、每行字符、材料物理上限）和每条经历的证据候选（含 JD 命中），供你自行决定每条经历写几条 bullet、每条用哪些证据、目标行数。本工具不生成简历。",
    parameters,
    execute: async (_toolCallId, params) => {
      const context = await inspector.inspect({
        jdId: params.jdId,
        experienceIds: [...params.experienceIds],
        language: params.language,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(context) }],
        details: context,
      };
    },
  };
}
