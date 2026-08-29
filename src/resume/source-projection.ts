import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "./source-types.js";
import {
  rankAvailableEvidence,
  slimEvidenceCandidates,
} from "./quality/evidence-candidates.js";
import { collectSkillHints } from "./workspace/section-registry.js";

const MAX_JD_RAW_TEXT_CHARS = 800;

export interface ResumeSourceProjection {
  schemaVersion: ResumeSourceSnapshot["schemaVersion"];
  sourceFingerprint: string;
  profile: ResumeSourceSnapshot["profile"];
  jd: unknown;
  experiences: unknown[];
  skillHints: string[];
  availableEvidence: unknown[];
  template: ResumeSourceSnapshot["template"];
  evidenceInstructions: unknown;
}

/**
 * Model-facing projection of an immutable snapshot. The immutable snapshot and
 * EvidenceLedger keep full source text; the model receives a compact, balanced
 * set of exact excerpts for every selected source item.
 */
export function projectResumeSourceSnapshot(
  snapshot: ResumeSourceSnapshot,
  bindings: readonly BulletEvidenceBinding[] = [],
  options: { maximumEvidence?: number } = {},
): ResumeSourceProjection {
  const availableEvidence = rankAvailableEvidence(
    snapshot,
    bindings,
    options.maximumEvidence,
  );
  return {
    schemaVersion: snapshot.schemaVersion,
    sourceFingerprint: snapshot.sourceFingerprint,
    profile: snapshot.profile,
    jd: {
      id: snapshot.jd.id,
      title: snapshot.jd.title,
      company: snapshot.jd.company,
      targetRole: snapshot.jd.targetRole,
      rawText: capJdRawText(snapshot.jd.rawText),
      contentHash: snapshot.jd.contentHash,
      requirements: snapshot.jd.requirements,
    },
    experiences: snapshot.experiences.map((experience) => {
      const exposedEvidenceCount = availableEvidence.filter(
        (candidate) => candidate.experienceId === experience.id,
      ).length;
      return {
        id: experience.id,
        category: experience.category,
        title: experience.title,
        organization: experience.organization,
        role: experience.role,
        location: experience.location,
        startDate: experience.startDate,
        endDate: experience.endDate,
        tags: experience.tags,
        resumeSectionKey: experience.resumeSectionKey,
        resumeSectionLabel: experience.resumeSectionLabel,
        revisionId: experience.revisionId,
        revisionContentHash: experience.contentHash,
        availableEvidenceCount: exposedEvidenceCount,
      };
    }),
    skillHints: collectSkillHints(snapshot.experiences),
    availableEvidence: slimEvidenceCandidates(availableEvidence),
    template: snapshot.template,
    evidenceInstructions: {
      offsetEncoding: "UTF-16",
      quoteRule:
        "Copy evidenceId values from availableEvidence exactly; never construct, extend, or compute ranges.",
      truthRule:
        "Do not add numbers, technologies, scope, ownership, or results absent from the cited source text.",
      draftPlanRule:
        "First group every Experience into complete WorkUnits. A bullet owns one or more whole WorkUnits; one WorkUnit may appear in only one bullet. Relevance changes total item lines, never a fixed bullet count. Batch the first complete draft, then use real measurements to enrich or trim content.",
    },
  };
}

function capJdRawText(rawText: string): string {
  if ([...rawText].length <= MAX_JD_RAW_TEXT_CHARS) return rawText;
  return `${[...rawText].slice(0, MAX_JD_RAW_TEXT_CHARS).join("")}\n…（原文已截断）`;
}
