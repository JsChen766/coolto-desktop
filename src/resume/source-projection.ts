import type { ResumeSourceSnapshot } from "./source-types.js";
import { rankAvailableEvidence } from "./quality/evidence-candidates.js";
import { collectSkillHints } from "./workspace/section-registry.js";

/**
 * Model-facing projection of an immutable snapshot. It keeps the complete
 * current source text and stable IDs, while excluding historical revisions and
 * unrelated profile fields.
 */
export function projectResumeSourceSnapshot(snapshot: ResumeSourceSnapshot): object {
  return {
    schemaVersion: snapshot.schemaVersion,
    sourceFingerprint: snapshot.sourceFingerprint,
    profile: snapshot.profile,
    jd: {
      id: snapshot.jd.id,
      title: snapshot.jd.title,
      company: snapshot.jd.company,
      targetRole: snapshot.jd.targetRole,
      rawText: snapshot.jd.rawText,
      contentHash: snapshot.jd.contentHash,
      requirements: snapshot.jd.requirements,
    },
    experiences: snapshot.experiences.map((experience) => ({
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
      content: experience.content,
      createdAt: experience.createdAt ?? null,
    })),
    skillHints: collectSkillHints(snapshot.experiences),
    availableEvidence: rankAvailableEvidence(snapshot, []),
    template: snapshot.template,
    evidenceInstructions: {
      offsetEncoding: "UTF-16",
      quoteRule:
        "Copy sourceQuote/sourceStart/sourceEnd from availableEvidence exactly; do not recalculate offsets manually.",
      truthRule:
        "Do not add numbers, technologies, scope, ownership, or results absent from the cited source text.",
    },
  };
}
