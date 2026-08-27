import type { JdReader, JdRecord } from "../../api/types.js";
import type { ResumePublicationGateway } from "../save/types.js";
import {
  isReusableLocalDraft,
  localDraftContentHash,
  sourceExperienceIds,
  type ResumeReuseDraftSource,
} from "./local-draft-source.js";

export interface ResumeReuseCandidateView {
  baseKind: "cloud" | "local";
  resumeId?: string;
  artifactId?: string;
  title: string;
  contentHash: string;
  updatedAt: string;
  sourceJd: {
    id: string;
    title: string;
    company: string | null;
    targetRole: string | null;
    updatedAt: string;
  };
  sourceExperienceIds: string[];
  retrievalSignals: {
    exactSourceJd: boolean;
    sameTargetRole: boolean;
    overlappingKeywords: string[];
  };
}

export async function findResumeReuseCandidates(input: {
  targetJdId: string;
  limit: number;
  jds: JdReader;
  resumes: ResumePublicationGateway;
  drafts?: ResumeReuseDraftSource;
  signal?: AbortSignal;
}): Promise<{
  targetJd: Pick<JdRecord, "id" | "title" | "company" | "targetRole">;
  candidates: ResumeReuseCandidateView[];
}> {
  const target = await input.jds.getJd(input.targetJdId, input.signal);
  const resumes = (await input.resumes.listResumes(input.signal)).filter(
    (resume) => resume.qualityStatus === "passed" &&
      resume.status !== "archived" && !resume.deletedAt && resume.jdId,
  );
  const sourceJds = new Map<string, JdRecord>();
  await Promise.all([...new Set(resumes.map((resume) => resume.jdId!))].map(
    async (jdId) => {
      const jd = await input.jds.getJd(jdId, input.signal).catch(() => undefined);
      if (jd) sourceJds.set(jdId, jd);
    },
  ));
  const targetRole = roleKey(target);
  const targetKeywords = keywordSet(target);
  const cloudCandidates = resumes.flatMap((resume): ResumeReuseCandidateView[] => {
    const source = sourceJds.get(resume.jdId!);
    if (!source) return [];
    const overlappingKeywords = [...keywordSet(source)]
      .filter((value) => targetKeywords.has(value)).sort();
    const sameTargetRole = Boolean(targetRole && targetRole === roleKey(source));
    if (!sameTargetRole && overlappingKeywords.length === 0) return [];
    return [{
      baseKind: "cloud", resumeId: resume.id, title: resume.title,
      contentHash: resume.contentHash, updatedAt: resume.updatedAt,
      sourceJd: {
        id: source.id, title: source.title, company: source.company,
        targetRole: source.targetRole, updatedAt: source.updatedAt,
      },
      sourceExperienceIds: resumeExperienceIds(resume.structured),
      retrievalSignals: {
        exactSourceJd: source.id === target.id,
        sameTargetRole,
        overlappingKeywords,
      },
    }];
  });
  const localCandidates = (await input.drafts?.listReusableDrafts() ?? [])
    .filter(isReusableLocalDraft)
    .flatMap((draft): ResumeReuseCandidateView[] => {
      const source = draft.workspace.sourceSnapshot.jd;
      const overlappingKeywords = [...keywordSet(source)]
        .filter((value) => targetKeywords.has(value)).sort();
      const sameTargetRole = Boolean(targetRole && targetRole === roleKey(source));
      if (source.id !== target.id && !sameTargetRole && !overlappingKeywords.length) {
        return [];
      }
      return [{
        baseKind: "local",
        artifactId: draft.artifactId,
        title: draft.title,
        contentHash: localDraftContentHash(draft),
        updatedAt: draft.updatedAt,
        sourceJd: {
          id: source.id, title: source.title, company: source.company,
          targetRole: source.targetRole, updatedAt: source.updatedAt,
        },
        sourceExperienceIds: sourceExperienceIds(draft),
        retrievalSignals: {
          exactSourceJd: source.id === target.id,
          sameTargetRole,
          overlappingKeywords,
        },
      }];
    });
  const candidates = [...cloudCandidates, ...localCandidates].sort((left, right) =>
    Number(right.retrievalSignals.exactSourceJd) -
      Number(left.retrievalSignals.exactSourceJd) ||
    Number(right.retrievalSignals.sameTargetRole) -
      Number(left.retrievalSignals.sameTargetRole) ||
    right.retrievalSignals.overlappingKeywords.length -
      left.retrievalSignals.overlappingKeywords.length ||
    right.updatedAt.localeCompare(left.updatedAt),
  ).slice(0, input.limit);
  return {
    targetJd: {
      id: target.id, title: target.title,
      company: target.company, targetRole: target.targetRole,
    },
    candidates,
  };
}

function roleKey(jd: Pick<JdRecord, "targetRole" | "title">): string {
  return normalize(jd.targetRole ?? jd.title);
}

function keywordSet(jd: {
  requirements: readonly { keywords: readonly string[] }[];
}): Set<string> {
  return new Set(jd.requirements.flatMap((requirement) =>
    requirement.keywords.map(normalize).filter(Boolean),
  ));
}

function resumeExperienceIds(
  structure: {
    sections: readonly {
      items: readonly { source_experience_id: string | null }[];
    }[];
  },
): string[] {
  return [...new Set(structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.source_experience_id ?? [])
  ))];
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
