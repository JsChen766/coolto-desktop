import type { JdReader, JdRecord } from "../../api/types.js";
import type { ResumePublicationGateway } from "../save/types.js";

export interface ResumeReuseCandidateView {
  resumeId: string;
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
  retrievalSignals: {
    sameTargetRole: boolean;
    overlappingKeywords: string[];
  };
}

export async function findResumeReuseCandidates(input: {
  targetJdId: string;
  limit: number;
  jds: JdReader;
  resumes: ResumePublicationGateway;
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
  const candidates = resumes.flatMap((resume): ResumeReuseCandidateView[] => {
    const source = sourceJds.get(resume.jdId!);
    if (!source) return [];
    const overlappingKeywords = [...keywordSet(source)]
      .filter((value) => targetKeywords.has(value)).sort();
    const sameTargetRole = Boolean(targetRole && targetRole === roleKey(source));
    if (!sameTargetRole && overlappingKeywords.length === 0) return [];
    return [{
      resumeId: resume.id, title: resume.title,
      contentHash: resume.contentHash, updatedAt: resume.updatedAt,
      sourceJd: {
        id: source.id, title: source.title, company: source.company,
        targetRole: source.targetRole, updatedAt: source.updatedAt,
      },
      retrievalSignals: { sameTargetRole, overlappingKeywords },
    }];
  }).sort((left, right) =>
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

function roleKey(jd: JdRecord): string {
  return normalize(jd.targetRole ?? jd.title);
}

function keywordSet(jd: JdRecord): Set<string> {
  return new Set(jd.requirements.flatMap((requirement) =>
    requirement.keywords.map(normalize).filter(Boolean),
  ));
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
