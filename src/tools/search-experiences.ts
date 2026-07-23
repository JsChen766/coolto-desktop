import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type {
  ExperienceCategory,
  ExperienceReader,
} from "../api/types.js";

const EXPERIENCE_CATEGORIES = [
  "work",
  "project",
  "education",
  "volunteer",
  "other",
] as const satisfies readonly ExperienceCategory[];

const parameters = Type.Object({
  q: Type.Optional(
    Type.String({
      description:
        "可选关键词，会搜索标题、组织、角色和当前经历正文。不要把整句用户请求原样放进来。",
      minLength: 1,
    }),
  ),
  category: Type.Optional(
    Type.Union(
      EXPERIENCE_CATEGORIES.map((category) => Type.Literal(category)),
      {
        description:
          "可选经历类别：work 工作、project 项目、education 教育、volunteer 志愿、other 其他。",
      },
    ),
  ),
  tags: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), {
      description: "可选标签列表；结果必须同时包含这些标签。",
      maxItems: 10,
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      description: "返回数量，默认 20，最大 100。",
      minimum: 1,
      maximum: 100,
    }),
  ),
  cursor: Type.Optional(
    Type.String({
      description: "继续分页时传入上一次结果的 nextCursor。",
      minLength: 1,
    }),
  ),
});

export function createSearchExperiencesTool(
  experienceReader: ExperienceReader,
): AgentTool<typeof parameters> {
  return {
    name: "search_experiences",
    label: "搜索经历",
    description:
      "列出或筛选当前登录用户的云端经历。用户询问“我有哪些经历”时可以不带筛选条件。结果主要是列表元数据；需要正文、完整版本或准确引用时，再使用 get_experience。",
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const result = await experienceReader.searchExperiences(params, signal);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
        details: result,
      };
    },
  };
}
