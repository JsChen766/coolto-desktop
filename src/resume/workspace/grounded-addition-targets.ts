import { rankAvailableEvidence } from "../quality/evidence-candidates.js";
import type { ResumeWorkspace } from "./types.js";

export interface GroundedAdditionTarget {
  itemId: string;
  evidenceId: string;
  sourceQuote: string;
}

/** Exposes unused facts without deciding their semantic relevance. */
export function groundedAdditionTargets(
  workspace: ResumeWorkspace,
  maximum: number,
): GroundedAdditionTarget[] {
  const itemIdByExperience = new Map(
    workspace.structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.source_experience_id
          ? [[item.source_experience_id, item.id] as const]
          : [],
      ),
    ),
  );
  const snapshotTargets = rankAvailableEvidence(
    workspace.sourceSnapshot,
    workspace.bindings,
  ).flatMap((candidate) => {
    const itemId = itemIdByExperience.get(candidate.experienceId);
    return itemId ? [{
      itemId,
      evidenceId: candidate.evidenceId,
      sourceQuote: candidate.sourceQuote,
    }] : [];
  });
  const usedEvidenceIds = new Set(
    (workspace.bulletProvenance ?? []).flatMap((entry) => entry.evidenceIds),
  );
  const supplementalTargets = (workspace.supplementalEvidence ?? []).flatMap(
    (evidence) => {
      const itemId = itemIdByExperience.get(evidence.experienceId);
      return itemId && !usedEvidenceIds.has(evidence.evidenceId) ? [{
        itemId,
        evidenceId: evidence.evidenceId,
        sourceQuote: evidence.text,
      }] : [];
    },
  );
  return [...snapshotTargets, ...supplementalTargets].slice(0, maximum);
}
