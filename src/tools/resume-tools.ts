import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumePublicationGateway } from "../resume/save/types.js";
import type { JdReader } from "../api/types.js";
import { createFindResumeReuseCandidatesTool } from "./find-resume-reuse-candidates.js";
import {
  localDraftAsResume,
  type ResumeReuseDraftSource,
} from "../resume/reuse/local-draft-source.js";

const listParameters = Type.Object({});
const getParameters = Type.Object({
  resumeId: Type.Optional(Type.String({ minLength: 1 })),
  artifactId: Type.Optional(Type.String({ minLength: 1 })),
});

export function createResumeReadTools(
  reader: ResumePublicationGateway,
  jds?: JdReader,
  drafts?: ResumeReuseDraftSource,
): AgentTool[] {
  const listTool: AgentTool<typeof listParameters> = {
    name: "list_resumes",
    label: "查看简历列表",
    description:
      "覆盖已有简历前列出用户可见的云端简历。每个 ID 对应一份唯一的当前文档。",
    parameters: listParameters,
    execute: async (_toolCallId, _params, signal) => {
      const resumes = await reader.listResumes(signal);
      const projection = resumes.map((resume) => ({
        id: resume.id,
        title: resume.title,
        targetRole: resume.targetRole,
        jdId: resume.jdId,
        contentHash: resume.contentHash,
        qualityStatus: resume.qualityStatus,
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
    label: "读取简历",
    description:
      "读取指定云端 Resume 或合格本地 ResumeDraft 的结构化正文；resumeId/artifactId 必须且只能提供一个。",
    parameters: getParameters,
    execute: async (_toolCallId, params, signal) => {
      if (Boolean(params.resumeId) === Boolean(params.artifactId)) {
        throw new Error("resumeId 与 artifactId 必须且只能提供一个");
      }
      const local = params.artifactId
        ? await drafts?.getReusableDraft(params.artifactId)
        : undefined;
      if (params.artifactId && !local) throw new Error("当前运行时不能读取本地简历基底");
      const resume = local
        ? localDraftAsResume(local)
        : await reader.getResume(params.resumeId!, signal);
      const projection = {
        id: resume.id,
        ...(local ? { source: "local" as const } : {}),
        title: resume.title,
        targetRole: resume.targetRole,
        jdId: resume.jdId,
        contentHash: resume.contentHash,
        schemaVersion: resume.schemaVersion,
        qualityStatus: resume.qualityStatus,
        status: resume.status,
        updatedAt: resume.updatedAt,
        structured: structuredClone(resume.structured),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(projection) }],
        details: projection,
      };
    },
  };
  return [
    listTool,
    getTool,
    ...(jds ? [createFindResumeReuseCandidatesTool(jds, reader, drafts)] : []),
  ];
}
