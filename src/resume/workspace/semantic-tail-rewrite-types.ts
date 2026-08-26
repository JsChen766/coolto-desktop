import type { TailRepairProgressState } from "./tail-repair-state.js";
import type { ResumeFactNeutralFragment } from "./fact-neutral-types.js";

export type SemanticTailRewriteStrategy = "compact" | "expand";

export interface SemanticTailRewriteCandidateInput {
  strategy: SemanticTailRewriteStrategy;
  revisedText: string;
  additionalEvidenceIds?: string[];
  contentMode?: "fact_neutral";
}

export interface SemanticTailRewriteInput {
  bulletId: string;
  candidates: SemanticTailRewriteCandidateInput[];
}

export interface SemanticTailRewriteFeedback {
  bulletId: string;
  candidateIndex: number;
  strategy: SemanticTailRewriteStrategy;
  status: "applied" | "rejected";
  reason?: string;
  lineCount?: number;
  lastLineRatio?: number;
}

export interface SemanticTailRewriteDiagnostics {
  requestedTargetCount: number;
  requestedCandidateCount: number;
  measuredCandidateCount: number;
  appliedTargetCount: number;
  validationRejectedCandidateCount: number;
  repetitionRejectedCandidateCount: number;
  layoutRejectedCandidateCount: number;
}

export interface SemanticTailRewriteBatchResult {
  updates: Array<{ bulletId: string; text: string; evidenceIds: string[] }>;
  feedback: SemanticTailRewriteFeedback[];
  progress: TailRepairProgressState;
  diagnostics: SemanticTailRewriteDiagnostics;
  factNeutralFragments?: ResumeFactNeutralFragment[];
  writeRejectedReason?: string;
}
