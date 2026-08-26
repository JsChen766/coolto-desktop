import type { TailRepairFeedback } from "./tail-repair-processor.js";
import type { TailRepairProgressState } from "./tail-repair-state.js";

export interface TailReflowInput {
  bulletId: string;
  revisedText: string;
  contentMode?: "fact_neutral";
}

export interface TailReflowDiagnostics {
  requestedTargetCount: number;
  measuredTargetCount: number;
  appliedTargetCount: number;
  passedTargetCount: number;
  rejectedTargetCount: number;
  validationRejectedTargetCount: number;
  lineCountRejectedTargetCount: number;
  tailRejectedTargetCount: number;
  pageRejectedTargetCount: number;
}

export interface TailReflowBatchResult {
  updates: Array<{ bulletId: string; text: string }>;
  feedback: TailRepairFeedback[];
  progress: TailRepairProgressState;
  diagnostics: TailReflowDiagnostics;
  writeRejectedReason?: string;
}
