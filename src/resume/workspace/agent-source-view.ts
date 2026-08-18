import { projectResumeSourceSnapshot } from "../source-projection.js";
import { rankAvailableEvidence } from "../quality/evidence-candidates.js";
import type { ResumeWorkspace } from "./types.js";

/**
 * Compact source context for Agent-facing workspace tools. Full immutable
 * sources stay in the workspace for validation; the 1M-context Agent receives
 * metadata once plus every writable exact excerpt from the selected sources.
 */
export function buildAgentSourceView(workspace: ResumeWorkspace): object {
  const projection = projectResumeSourceSnapshot(
    workspace.sourceSnapshot,
    workspace.bindings,
    { maximumEvidence: Number.POSITIVE_INFINITY },
  );
  const availableEvidence = rankAvailableEvidence(
    workspace.sourceSnapshot,
    workspace.bindings,
    Number.POSITIVE_INFINITY,
  ).map((candidate) => ({
    evidenceId: candidate.evidenceId,
    experienceId: candidate.experienceId,
    text: candidate.sourceQuote,
    // Requirement matching is Agent-owned. The host exposes exact source
    // text and validates IDs the Agent elects to attach, but does not suggest
    // keyword-derived matches in the orchestrated path.
    requirementIds: [],
  }));
  const supplementalEvidence = (workspace.supplementalEvidence ?? []).map(
    ({ evidenceId, experienceId, text }) => ({
      evidenceId,
      experienceId,
      text,
      requirementIds: [],
    }),
  );
  return {
    source: {
      profile: projection.profile,
      jd: projection.jd,
      experiences: projection.experiences,
      skillHints: projection.skillHints,
      template: projection.template,
      evidenceInstructions: projection.evidenceInstructions,
    },
    availableEvidence: [...supplementalEvidence, ...availableEvidence],
  };
}
