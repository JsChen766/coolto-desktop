import type { ResumeReuseDraftSource } from
  "../../resume/reuse/local-draft-source.js";
import { localDraftAsResume } from
  "../../resume/reuse/local-draft-source.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import type { ResumeFull } from "../../resume/types.js";
import type { ResumeItemTier } from "../../resume/workspace/types.js";

export interface ResolvedWorkspaceBase {
  kind: "cloud" | "local";
  sourceId: string;
  resume: ResumeFull;
  itemTiers?: Record<string, ResumeItemTier>;
}

export async function resolveWorkspaceBase(input: {
  baseResumeId?: string;
  baseDraftArtifactId?: string;
  resumeReader?: ResumePublicationGateway;
  draftReader?: ResumeReuseDraftSource;
}): Promise<ResolvedWorkspaceBase | undefined> {
  if (input.baseResumeId && input.baseDraftArtifactId) {
    throw new Error("baseResumeId 与 baseDraftArtifactId 只能提供一个");
  }
  if (input.baseResumeId) {
    if (!input.resumeReader) throw new Error("当前运行时不支持云端 Resume 基底");
    return {
      kind: "cloud",
      sourceId: input.baseResumeId,
      resume: await input.resumeReader.getResume(input.baseResumeId),
    };
  }
  if (!input.baseDraftArtifactId) return undefined;
  if (!input.draftReader) throw new Error("当前运行时不支持本地 ResumeDraft 基底");
  return {
    kind: "local",
    sourceId: input.baseDraftArtifactId,
    ...localBase(
      await input.draftReader.getReusableDraft(input.baseDraftArtifactId),
    ),
  };
}

function localBase(
  draft: Awaited<ReturnType<ResumeReuseDraftSource["getReusableDraft"]>>,
) {
  return {
    resume: localDraftAsResume(draft),
    itemTiers: structuredClone(draft.workspace.itemTiers ?? {}),
  };
}
