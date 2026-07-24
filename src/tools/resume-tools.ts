import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumePublicationGateway } from "../resume/save/types.js";

const listParameters = Type.Object({});
const getParameters = Type.Object({
  resumeId: Type.String({ minLength: 1 }),
});

export function createResumeReadTools(
  reader: ResumePublicationGateway,
): AgentTool[] {
  const listTool: AgentTool<typeof listParameters> = {
    name: "list_resumes",
    label: "查看简历列表",
    description:
      "保存为已有简历的新版本前列出用户可见的正式简历。只返回定位目标所需的 ID、标题和 active variant，不返回 staged 草稿。",
    parameters: listParameters,
    execute: async (_toolCallId, _params, signal) => {
      const resumes = await reader.listResumes(signal);
      const projection = resumes.map((resume) => ({
        id: resume.id,
        title: resume.title,
        targetRole: resume.targetRole,
        jdId: resume.jdId,
        activeVariantId: resume.activeVariantId,
        updatedAt: resume.updatedAt,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(projection) }],
        details: projection,
      };
    },
  };
  const getTool: AgentTool<typeof getParameters> = {
    name: "get_resume",
    label: "读取简历版本信息",
    description:
      "读取指定正式简历及其 published 版本元数据，用于确认保存目标和当前 active variant；不调用后端 Agent。",
    parameters: getParameters,
    execute: async (_toolCallId, params, signal) => {
      const resume = await reader.getResume(params.resumeId, signal);
      const projection = {
        id: resume.id,
        title: resume.title,
        targetRole: resume.targetRole,
        jdId: resume.jdId,
        activeVariantId: resume.activeVariantId,
        variants: resume.variants.map((variant) => ({
          id: variant.id,
          title: variant.title,
          version: variant.version,
          gateStatus: variant.gateStatus,
          publicationStatus: variant.publicationStatus,
          createdAt: variant.createdAt,
        })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(projection) }],
        details: projection,
      };
    },
  };
  return [listTool, getTool];
}
