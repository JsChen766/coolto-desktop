import type {
  ResumeEvidenceAssessmentInput,
  ResumeEvidenceAssessmentRound,
} from "./evidence-assessment-types.js";
import type { ResumeWorkspace } from "./types.js";
import {
  assessmentCandidates,
  recencyKey,
  usedEvidenceIds,
} from "./evidence-assessment-candidates.js";
import { advanceEvidenceAssessment } from
  "./evidence-assessment-transition.js";

const ASSESSMENT_BATCH_SIZE = 24;

export interface ResumeEvidenceAssessmentAction {
  mode: "assess_evidence";
  round: ResumeEvidenceAssessmentRound;
  threshold: "transferable" | "truthful";
  requiredInput: "decisions";
  evidenceIds: string[];
  evidenceCandidates: Array<{
    evidenceId: string;
    experienceId: string;
    sourceQuote: string;
    endDate: string | null;
    previousStatus: string;
  }>;
  allowedStatuses: string[];
  hardExclusionReasonCodes: Record<string, string[]>;
}

export function startEvidenceReassessment(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  if (workspace.reuseBase || workspace.evidenceAssessment) return workspace;
  const used = usedEvidenceIds(workspace);
  const decisions = Object.fromEntries(assessmentCandidates(workspace).map(
    (candidate) => [candidate.evidenceId, {
      evidenceId: candidate.evidenceId,
      experienceId: candidate.experienceId,
      status: used.has(candidate.evidenceId) ? "used" as const : "pending" as const,
      assessmentRound: used.has(candidate.evidenceId) ? 0 as const : 1 as const,
      reasonCode: used.has(candidate.evidenceId)
        ? "used_in_initial_generation" : "not_selected_in_initial_generation",
      assessedAtRevision: workspace.revision,
    }],
  ));
  return advanceEvidenceAssessment({
    ...workspace,
    evidenceAssessment: {
      phase: "reassessment_1",
      round: 1,
      noMoreMaterialConfirmedAt:
        workspace.factNeutralAuthorization?.confirmedAt ?? new Date().toISOString(),
      targetingQuality: "standard",
      decisions,
    },
  });
}

export function evidenceAssessmentNextAction(
  workspace: ResumeWorkspace,
): ResumeEvidenceAssessmentAction | undefined {
  const state = workspace.evidenceAssessment;
  if (!state || !state.phase.startsWith("reassessment_")) return undefined;
  const candidates = assessmentCandidates(workspace);
  const byId = new Map(candidates.map((candidate) => [candidate.evidenceId, candidate]));
  const pending = Object.values(state.decisions)
    .filter((decision) => decision.status === "pending")
    .map((decision) => byId.get(decision.evidenceId))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  const ordered = state.round === 2
    ? pending.sort((left, right) => recencyKey(right).localeCompare(recencyKey(left)))
    : pending;
  const batch = ordered.slice(0, ASSESSMENT_BATCH_SIZE);
  if (!batch.length) return undefined;
  return {
    mode: "assess_evidence",
    round: state.round,
    threshold: state.round === 1 ? "transferable" : "truthful",
    requiredInput: "decisions",
    evidenceIds: batch.map((candidate) => candidate.evidenceId),
    evidenceCandidates: batch.map((candidate) => ({
      evidenceId: candidate.evidenceId,
      experienceId: candidate.experienceId,
      sourceQuote: candidate.sourceQuote,
      endDate: candidate.endDate,
      previousStatus: state.decisions[candidate.evidenceId]?.status ?? "pending",
    })),
    allowedStatuses: state.round === 1
      ? ["selected", "deferred", "excluded_duplicate", "excluded_invalid"]
      : ["selected", "excluded_duplicate", "excluded_invalid"],
    hardExclusionReasonCodes: {
      excluded_duplicate: ["duplicate_existing_fact"],
      excluded_invalid: ["invalid_fragment", "unsafe_to_state_as_bullet"],
    },
  };
}

export function applyEvidenceAssessment(
  workspace: ResumeWorkspace,
  round: ResumeEvidenceAssessmentRound,
  inputs: readonly ResumeEvidenceAssessmentInput[],
): ResumeWorkspace {
  const state = workspace.evidenceAssessment;
  const action = evidenceAssessmentNextAction(workspace);
  if (!state || !action || state.round !== round || action.round !== round) {
    throw new Error("当前工作区不在对应的证据复评阶段");
  }
  const supplied = new Set(inputs.map((input) => input.evidenceId));
  const required = new Set(action.evidenceIds);
  const missing = action.evidenceIds.filter((id) => !supplied.has(id));
  const extra = [...supplied].filter((id) => !required.has(id));
  if (inputs.length !== supplied.size || missing.length || extra.length) {
    throw new Error(
      `证据复评必须一次覆盖当前批次；missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`,
    );
  }
  const allowed = new Set(action.allowedStatuses);
  const decisions = { ...state.decisions };
  for (const input of inputs) {
    if (!allowed.has(input.status)) {
      throw new Error(`第 ${round} 轮不允许 evidence status=${input.status}`);
    }
    if (input.reasonCode.trim().length < 3) throw new Error("证据判断必须提供 reasonCode");
    if (input.status === "excluded_duplicate" &&
      input.reasonCode !== "duplicate_existing_fact") {
      throw new Error("重复证据只能使用 reasonCode=duplicate_existing_fact");
    }
    if (input.status === "excluded_invalid" && ![
      "invalid_fragment", "unsafe_to_state_as_bullet",
    ].includes(input.reasonCode)) {
      throw new Error("无效证据必须使用允许的硬排除 reasonCode");
    }
    const previous = decisions[input.evidenceId]!;
    decisions[input.evidenceId] = {
      ...previous,
      status: input.status,
      assessmentRound: round,
      reasonCode: input.reasonCode.trim(),
      assessedAtRevision: workspace.revision + 1,
    };
  }
  return advanceEvidenceAssessment({
    ...workspace,
    revision: workspace.revision + 1,
    compileObservedRevision: workspace.revision + 1,
    bestSnapshot: { ...workspace.bestSnapshot, revision: workspace.revision + 1 },
    evidenceAssessment: {
      ...state,
      targetingQuality: round === 2 && inputs.some((input) =>
          input.status === "selected"
        ) ? "limited" : state.targetingQuality,
      decisions,
    },
  });
}

export function syncEvidenceAssessment(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  const state = workspace.evidenceAssessment;
  if (!state) return workspace;
  const used = usedEvidenceIds(workspace);
  const decisions = Object.fromEntries(Object.entries(state.decisions).map(
    ([id, decision]) => [id, used.has(id) ? {
      ...decision,
      status: "used" as const,
      reasonCode: "written_to_resume",
      assessedAtRevision: workspace.revision,
    } : decision],
  ));
  return advanceEvidenceAssessment({
    ...workspace,
    evidenceAssessment: { ...state, decisions },
  });
}

export function rejectSelectedEvidence(
  workspace: ResumeWorkspace,
  evidenceIds: readonly string[],
  reasonCode: string,
): ResumeWorkspace {
  const state = workspace.evidenceAssessment;
  if (!state) return workspace;
  const targets = new Set(evidenceIds);
  if (!Object.values(state.decisions).some((decision) =>
    targets.has(decision.evidenceId) && decision.status === "selected"
  )) return workspace;
  const decisions = Object.fromEntries(Object.entries(state.decisions).map(
    ([id, decision]) => [id, targets.has(id) && decision.status === "selected"
      ? { ...decision, status: "rejected_write" as const, reasonCode,
          assessedAtRevision: workspace.revision + 1 }
      : decision],
  ));
  return advanceEvidenceAssessment({
    ...workspace,
    revision: workspace.revision + 1,
    compileObservedRevision: workspace.revision + 1,
    bestSnapshot: { ...workspace.bestSnapshot, revision: workspace.revision + 1 },
    evidenceAssessment: { ...state, decisions },
  });
}

export function selectedEvidenceIds(workspace: ResumeWorkspace): Set<string> | undefined {
  const state = workspace.evidenceAssessment;
  if (!state) return undefined;
  return new Set(Object.values(state.decisions)
    .filter((decision) => decision.status === "selected")
    .map((decision) => decision.evidenceId));
}

export function hasPendingEvidenceAssessmentWork(
  workspace: ResumeWorkspace,
): boolean {
  if (evidenceAssessmentNextAction(workspace)) return true;
  return (selectedEvidenceIds(workspace)?.size ?? 0) > 0;
}
