import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { JdReader } from "../api/types.js";

const searchParameters = Type.Object({
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 100, description: "返回数量，默认 20。" }),
  ),
  cursor: Type.Optional(
    Type.String({ minLength: 1, description: "继续分页时传入上次的 nextCursor。" }),
  ),
});

const getParameters = Type.Object({
  jdId: Type.String({
    minLength: 1,
    description: "必须来自 search_jds、当前上下文或用户明确提供的 JD ID。",
  }),
});

export function createJdTools(jdReader: JdReader): AgentTool[] {
  const searchTool: AgentTool<typeof searchParameters> = {
    name: "search_jds",
    label: "列出岗位描述",
    description:
      "分页列出当前登录用户保存的 JD。结果只包含选择所需的摘要；需要完整岗位正文和 requirement IDs 时再调用 get_jd。",
    parameters: searchParameters,
    execute: async (_toolCallId, params, signal) => {
      const result = await jdReader.listJds(params, signal);
      const projected = {
        items: result.items.map((jd) => ({
          id: jd.id,
          title: jd.title,
          company: jd.company,
          targetRole: jd.targetRole,
          requirementsCount: jd.requirements.length,
          updatedAt: jd.updatedAt,
        })),
        nextCursor: result.nextCursor,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(projected) }],
        details: projected,
      };
    },
  };
  const getTool: AgentTool<typeof getParameters> = {
    name: "get_jd",
    label: "读取岗位描述",
    description:
      "按 ID 读取当前用户保存的一份完整 JD，包括原文、稳定 requirement IDs 和版本 hash。没有可靠 JD ID 时先调用 search_jds。",
    parameters: getParameters,
    execute: async (_toolCallId, params, signal) => {
      const jd = await jdReader.getJd(params.jdId, signal);
      return {
        content: [{ type: "text", text: JSON.stringify(jd) }],
        details: jd,
      };
    },
  };
  return [searchTool, getTool];
}
