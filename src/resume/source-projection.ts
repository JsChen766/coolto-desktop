import type { ResumeSourceSnapshot } from "./source-types.js";
import {
  rankAvailableEvidence,
  slimEvidenceCandidates,
} from "./quality/evidence-candidates.js";
import { collectSkillHints } from "./workspace/section-registry.js";

const MAX_JD_RAW_TEXT_CHARS = 800;

/**
 * Model-facing projection of an immutable snapshot. The immutable snapshot and
 * EvidenceLedger keep full source text; the model receives a compact, balanced
 * set of exact excerpts for every selected source item.
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
      rawText: capJdRawText(snapshot.jd.rawText),
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
      plannedBullets: plannedBulletsFor(experience.category),
    })),
    skillHints: collectSkillHints(snapshot.experiences),
    availableEvidence: slimEvidenceCandidates(rankAvailableEvidence(snapshot, [])),
    template: snapshot.template,
    evidenceInstructions: {
      offsetEncoding: "UTF-16",
      quoteRule:
        "Copy evidenceId values from availableEvidence exactly; never construct, extend, or compute ranges.",
      truthRule:
        "Do not add numbers, technologies, scope, ownership, or results absent from the cited source text.",
      draftPlanRule:
        "Round 1 initialBindings must follow plannedBullets per experience (education 2, work 4, project 3) and write each bullet about 1.7–2 lines so the first draft already approaches the 85% page target; the workspace instruction gives the precise character target after the first compile.",
    },
  };
}

export function plannedBulletsFor(category: string): number {
  if (category === "work") return 4;
  if (category === "project") return 3;
  return 2;
}

function capJdRawText(rawText: string): string {
  if ([...rawText].length <= MAX_JD_RAW_TEXT_CHARS) return rawText;
  return `${[...rawText].slice(0, MAX_JD_RAW_TEXT_CHARS).join("")}\n…（原文已截断）`;
}
