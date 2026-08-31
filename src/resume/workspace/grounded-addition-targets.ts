import {
  rankAvailableEvidence,
  structuralEvidenceCandidates,
} from "../quality/evidence-candidates.js";
import type { ResumeWorkspace } from "./types.js";
import { selectedEvidenceIds } from "./evidence-assessment.js";

export interface GroundedAdditionTarget {
  itemId: string;
  evidenceId: string;
  evidenceIds: string[];
  workUnitId?: string;
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
  const selected = selectedEvidenceIds(workspace);
  if (workspace.workUnitMap?.status === "ready") {
    const usedUnits = new Set(
      (workspace.bulletProvenance ?? []).flatMap((entry) =>
        entry.workUnitIds ?? []
      ),
    );
    const evidenceText = new Map([
      ...structuralEvidenceCandidates(workspace.sourceSnapshot).map(
        (entry) => [entry.evidenceId, entry.sourceQuote] as const,
      ),
      ...(workspace.supplementalEvidence ?? []).map(
        (entry) => [entry.evidenceId, entry.text] as const,
      ),
    ]);
    return workspace.workUnitMap.units.filter((unit) =>
      !usedUnits.has(unit.workUnitId) &&
      (!selected || unit.evidenceIds.some((id) => selected.has(id)))
    ).flatMap((unit) => {
      const itemId = itemIdByExperience.get(unit.sourceExperienceId);
      const sourceQuote = unit.evidenceIds.map((id) => evidenceText.get(id) ?? "")
        .filter(Boolean).join("；");
      return itemId ? [{
        itemId, workUnitId: unit.workUnitId,
        evidenceId: unit.evidenceIds[0]!, evidenceIds: [...unit.evidenceIds],
        sourceQuote,
      }] : [];
    }).slice(0, maximum);
  }
  const snapshotTargets = rankAvailableEvidence(
    workspace.sourceSnapshot,
    workspace.bindings,
  ).flatMap((candidate) => {
    const itemId = itemIdByExperience.get(candidate.experienceId);
    return itemId ? [{
      itemId,
      evidenceId: candidate.evidenceId,
      evidenceIds: [candidate.evidenceId],
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
        evidenceIds: [evidence.evidenceId],
        sourceQuote: evidence.text,
      }] : [];
    },
  );
  const eligible = selected
    ? [...snapshotTargets, ...supplementalTargets].filter((target) =>
        selected.has(target.evidenceId)
      )
    : [...snapshotTargets, ...supplementalTargets];
  return eligible.slice(0, maximum);
}
