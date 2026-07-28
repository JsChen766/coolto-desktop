import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ExperienceReader } from "../api/types.js";

const parameters = Type.Object({
  experienceId: Type.String({
    description:
      "要读取的经历 ID。必须来自 search_experiences、当前上下文或用户明确提供的 ID。",
    minLength: 1,
  }),
});

export function createGetExperienceTool(
  experienceReader: ExperienceReader,
): AgentTool<typeof parameters> {
  return {
    name: "get_experience",
    label: "读取经历详情",
    description:
      "按 ID 读取当前登录用户经历库中的一条经历，包括当前正文和同步状态。需要分析、引用或改写具体经历时使用。没有可靠 experienceId 时先调用 search_experiences，不要猜测 ID。工具只返回历史版本元数据，不返回所有历史正文。",
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const experience = await experienceReader.getExperience(
        params.experienceId,
        signal,
      );
      const { revisions, ...currentExperience } = experience;
      const result = {
        ...currentExperience,
        revisionHistory: revisions.map((revision) => ({
          id: revision.id,
          source: revision.source,
          factBankStatus: revision.factBankStatus,
          createdAt: revision.createdAt,
        })),
      };
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
