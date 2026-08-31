import { hasSafeEvidenceCapacity } from
  "./evidence-assessment-candidates.js";
import type { ResumeWorkspace } from "./types.js";

const HARD_EXCLUSIONS = new Set(["used", "excluded_duplicate", "excluded_invalid"]);

export function advanceEvidenceAssessment(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  const state = workspace.evidenceAssessment!;
  if (state.phase.startsWith("reassessment_") &&
    Object.values(state.decisions).some((decision) => decision.status === "pending")) {
    return workspace;
  }
  if (state.phase.startsWith("reassessment_")) {
    return advanceEvidenceAssessment({
      ...workspace,
      evidenceAssessment: {
        ...state,
        phase: state.round === 1 ? "grounded_fill_1" : "grounded_fill_2",
      },
    });
  }
  if (!state.phase.startsWith("grounded_fill_")) return workspace;
  const selected = Object.values(state.decisions).filter(
    (decision) => decision.status === "selected",
  );
  if (selected.length && hasSafeEvidenceCapacity(workspace)) return workspace;
  let decisions = state.decisions;
  if (selected.length) {
    decisions = Object.fromEntries(Object.entries(decisions).map(
      ([id, decision]) => [id, decision.status === "selected"
        ? { ...decision, status: "deferred_space" as const,
            reasonCode: "single_page_capacity_exhausted" }
        : decision],
    ));
  }
  if (state.round === 1 && hasSafeEvidenceCapacity(workspace)) {
    decisions = Object.fromEntries(Object.entries(decisions).map(
      ([id, decision]) => [id, HARD_EXCLUSIONS.has(decision.status)
        ? decision
        : { ...decision, status: "pending" as const,
            assessmentRound: 2 as const,
            reasonCode: "reassess_with_truthful_threshold" }],
    ));
    return advanceEvidenceAssessment({
      ...workspace,
      evidenceAssessment: {
        ...state,
        phase: "reassessment_2",
        round: 2,
        decisions,
      },
    });
  }
  return {
    ...workspace,
    evidenceAssessment: { ...state, phase: "neutral_closure", decisions },
  };
}
