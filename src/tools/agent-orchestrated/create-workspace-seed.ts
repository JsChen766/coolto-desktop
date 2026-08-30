import type { ResumePublicationGateway } from "../../resume/save/types.js";
import type { ResumeSourceSnapshot } from "../../resume/source-types.js";
import type { ResumeStructure } from "../../resume/types.js";
import type { ResumeReuseDraftSource } from
  "../../resume/reuse/local-draft-source.js";
import { buildUserDirectedHistorySeed } from
  "../../resume/reuse/user-directed-seed.js";
import { seedFromPublishedResume } from
  "../../resume/workspace/published-resume-seed.js";
import type { ResumeItemTier } from "../../resume/workspace/types.js";
import type { ResumeReuseBase } from
  "../../resume/workspace/reuse-adaptation-types.js";
import { resolveWorkspaceBase } from "./create-workspace-base.js";

export async function resolveWorkspaceSeed(input: {
  selectionPolicy: "relevance" | "user_directed";
  baseResumeId?: string;
  baseDraftArtifactId?: string;
  fresh: ResumeStructure;
  snapshot: ResumeSourceSnapshot;
  experienceIds: readonly string[];
  resumeReader?: ResumePublicationGateway;
  draftReader?: ResumeReuseDraftSource;
}): Promise<{
  seed?: ReturnType<typeof seedFromPublishedResume>;
  reuseBase?: ResumeReuseBase;
  baseItemTiers?: Record<string, ResumeItemTier>;
}> {
  if (input.selectionPolicy === "user_directed") {
    if (input.baseResumeId || input.baseDraftArtifactId) {
      throw new Error("user_directed 会按 Experience 自动选择历史写法，不接受单一简历基底");
    }
    const history = await buildUserDirectedHistorySeed({
      fresh: input.fresh,
      snapshot: input.snapshot,
      experienceIds: input.experienceIds,
      ...(input.resumeReader ? { resumes: input.resumeReader } : {}),
      ...(input.draftReader ? { drafts: input.draftReader } : {}),
    });
    return history ? { seed: history.seed, reuseBase: history.reuseBase } : {};
  }
  const resolved = await resolveWorkspaceBase({
    ...(input.baseResumeId ? { baseResumeId: input.baseResumeId } : {}),
    ...(input.baseDraftArtifactId
      ? { baseDraftArtifactId: input.baseDraftArtifactId } : {}),
    ...(input.resumeReader ? { resumeReader: input.resumeReader } : {}),
    ...(input.draftReader ? { draftReader: input.draftReader } : {}),
  });
  if (!resolved) return {};
  const seed = seedFromPublishedResume({
    fresh: input.fresh,
    snapshot: input.snapshot,
    base: resolved.resume,
  });
  return {
    seed,
    reuseBase: {
      kind: resolved.kind,
      resumeId: resolved.sourceId,
      sourceJdId: resolved.resume.jdId,
      contentHash: resolved.resume.contentHash,
      retainedBulletCount: seed.retainedBulletCount,
      droppedBulletCount: seed.droppedBulletCount,
    },
    ...(resolved.kind === "local" &&
      resolved.resume.jdId === (input.snapshot.jd?.id ?? null)
      ? { baseItemTiers: resolved.itemTiers }
      : {}),
  };
}
