import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { JdReader } from "../api/types.js";
import { findResumeReuseCandidates } from "../resume/reuse/candidate-retrieval.js";
import type { ResumePublicationGateway } from "../resume/save/types.js";

const parameters = Type.Object({
  targetJdId: Type.String({ minLength: 1 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
});

export function createFindResumeReuseCandidatesTool(
  jds: JdReader,
  resumes: ResumePublicationGateway,
): AgentTool<typeof parameters> {
  return {
    name: "find_resume_reuse_candidates",
    label: "查找可复用简历基底",
    description:
      "在为新 JD 创建简历工作区前，查找由相似历史 JD 生成且质量通过的 Resume。" +
      "宿主只按目标岗位、JD 关键词重叠和更新时间缩小候选，不决定是否复用；" +
      "你必须读取候选的完整 JD/Resume 后自行判断。没有合适候选时从零生成。",
    parameters,
    execute: async (_id, input, signal) => {
      const result = await findResumeReuseCandidates({
        targetJdId: input.targetJdId,
        limit: input.limit ?? 10,
        jds, resumes,
        ...(signal ? { signal } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify({
          ...result,
          instruction:
            "候选只是检索结果。读取完整 source JD 和 Resume 后由你决定是否把 resumeId 作为 baseResumeId；不得按宿主信号自动套用。",
        }) }],
        details: result,
      };
    },
  };
}
