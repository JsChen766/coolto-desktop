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
    abilityOverlap: number;
    mustHaveOverlap: number;
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
    const overlap = capabilityOverlap(target, source);
    if (!sameTargetRole && overlap.abilityOverlap === 0) return [];
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
        ...overlap,
        overlappingKeywords,
      },
    }];
  });
  const localCandidates = (await input.drafts?.listReusableDrafts() ?? [])
    .filter(isReusableLocalDraft)
    .flatMap((draft): ResumeReuseCandidateView[] => {
      const source = draft.workspace.sourceSnapshot.jd;
      if (!source) return [];
      const overlappingKeywords = [...keywordSet(source)]
        .filter((value) => targetKeywords.has(value)).sort();
      const sameTargetRole = Boolean(targetRole && targetRole === roleKey(source));
      const overlap = capabilityOverlap(target, source);
      if (source.id !== target.id && !sameTargetRole &&
        overlap.abilityOverlap === 0) {
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
          ...overlap,
          overlappingKeywords,
        },
      }];
    });
  const candidates = [...cloudCandidates, ...localCandidates].sort((left, right) =>
    Number(right.retrievalSignals.exactSourceJd) -
      Number(left.retrievalSignals.exactSourceJd) ||
    right.retrievalSignals.mustHaveOverlap -
      left.retrievalSignals.mustHaveOverlap ||
    right.retrievalSignals.abilityOverlap -
      left.retrievalSignals.abilityOverlap ||
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

function capabilityOverlap(
  target: CapabilityJd,
  source: CapabilityJd,
): { abilityOverlap: number; mustHaveOverlap: number } {
  const sourceTerms = keywordSet(source);
  const matched = (requirement: CapabilityRequirement) =>
    requirementTerms(requirement).some((term) => sourceTerms.has(term));
  const totalWeight = target.requirements.reduce(
    (sum, requirement) => sum + requirementWeight(requirement), 0,
  );
  const matchedWeight = target.requirements.filter(matched).reduce(
    (sum, requirement) => sum + requirementWeight(requirement), 0,
  );
  const mustHave = target.requirements.filter((requirement) =>
    requirement.v2Importance === "must_have" ||
    (!requirement.v2Importance && requirement.importance === "high")
  );
  return {
    abilityOverlap: ratio(matchedWeight, totalWeight),
    mustHaveOverlap: ratio(mustHave.filter(matched).length, mustHave.length),
  };
}

function requirementTerms(
  requirement: CapabilityRequirement,
): string[] {
  const keywords = requirement.keywords.map(normalize).filter(Boolean);
  return keywords.length ? keywords : requirement.text.split(/[^\p{L}\p{N}+#.]+/u)
    .map(normalize).filter((term) => term.length >= 2);
}

function requirementWeight(
  requirement: CapabilityRequirement,
): number {
  return requirement.weight ?? (requirement.importance === "high" ? 1 :
    requirement.importance === "medium" ? 0.6 : 0.3);
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 1;
}

interface CapabilityJd {
  requirements: readonly CapabilityRequirement[];
}

interface CapabilityRequirement {
  text: string;
  keywords: readonly string[];
  weight: number | null;
  importance: string;
  v2Importance?: string | null;
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
