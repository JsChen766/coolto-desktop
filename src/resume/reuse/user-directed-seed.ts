import type { ResumePublicationGateway } from "../save/types.js";
import { sha256, stableStringify } from "../stable-snapshot.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import type { ResumeFull, ResumeStructure } from "../types.js";
import {
  seedFromPublishedResume,
  type PublishedResumeSeedResult,
} from "../workspace/published-resume-seed.js";
import type { ResumeReuseBase } from "../workspace/reuse-adaptation-types.js";
import {
  isReusableLocalDraft,
  localDraftAsResume,
  type ResumeReuseDraftSource,
} from "./local-draft-source.js";
import { selectUserDirectedExperienceHistory } from
  "./user-directed-history.js";

export interface UserDirectedHistorySeed {
  seed: PublishedResumeSeedResult;
  reuseBase: ResumeReuseBase;
}

export async function buildUserDirectedHistorySeed(input: {
  fresh: ResumeStructure;
  snapshot: ResumeSourceSnapshot;
  experienceIds: readonly string[];
  resumes?: ResumePublicationGateway;
  drafts?: ResumeReuseDraftSource;
}): Promise<UserDirectedHistorySeed | undefined> {
  const [cloud, localDrafts] = await Promise.all([
    input.resumes?.listResumes() ?? Promise.resolve([]),
    input.drafts?.listReusableDrafts() ?? Promise.resolve([]),
  ]);
  const local = localDrafts.filter(isReusableLocalDraft).map(localDraftAsResume);
  const localIds = new Set(local.map((resume) => resume.id));
  const selected = selectUserDirectedExperienceHistory({
    experienceIds: input.experienceIds,
    resumes: [...cloud, ...local],
    language: input.fresh.language,
  });
  if (!selected.length) return undefined;
  const composite = compositeResume(input.fresh, selected.map((item) => ({
    experienceId: item.experienceId,
    resume: item.resume,
  })));
  let seed: PublishedResumeSeedResult;
  try {
    seed = seedFromPublishedResume({
      fresh: input.fresh,
      snapshot: input.snapshot,
      base: composite,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("没有与当前 Experience")) {
      return undefined;
    }
    throw error;
  }
  const sources = selected.map(({ experienceId, resume }) => ({
    experienceId,
    kind: localIds.has(resume.id) ? "local" as const : "cloud" as const,
    sourceId: resume.id,
    updatedAt: resume.updatedAt,
  }));
  const contentHash = sha256(stableStringify(sources.map((source) => ({
    ...source,
    contentHash: selected.find((item) =>
      item.experienceId === source.experienceId
    )!.resume.contentHash,
  }))));
  return {
    seed,
    reuseBase: {
      kind: "composite",
      resumeId: `user-directed-${contentHash.slice(0, 20)}`,
      sourceJdId: null,
      contentHash,
      retainedBulletCount: seed.retainedBulletCount,
      droppedBulletCount: seed.droppedBulletCount,
      sources,
    },
  };
}

function compositeResume(
  fresh: ResumeStructure,
  selected: readonly { experienceId: string; resume: ResumeFull }[],
): ResumeFull {
  const first = selected[0]!.resume;
  const byExperience = new Map(selected.map((item) => [
    item.experienceId,
    item.resume,
  ]));
  const sections = fresh.sections.map((section) => ({
    ...structuredClone(section),
    items: section.items.flatMap((item) => {
      const sourceId = item.source_experience_id;
      const resume = sourceId ? byExperience.get(sourceId) : undefined;
      const prior = resume?.structured.sections
        .find((candidate) => candidate.type === section.type)?.items
        .find((candidate) => candidate.source_experience_id === sourceId);
      return prior ? [structuredClone(prior)] : [];
    }),
  }));
  return {
    ...structuredClone(first),
    id: "user-directed-composite",
    title: "用户指定经历历史写法",
    jdId: null,
    status: "active",
    qualityStatus: "passed",
    structured: { ...structuredClone(fresh), sections },
  };
}
