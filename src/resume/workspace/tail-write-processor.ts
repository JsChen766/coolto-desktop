import type { ResumeCompiler } from "./compiler-port.js";
import type { ResumeAgentNextAction } from "./agent-next-action.js";
import {
  processTailReflowBatch,
  type TailReflowDiagnostics,
  type TailReflowInput,
} from "./tail-reflow-processor.js";
import {
  processTailRepairBatch,
  type TailGrowthInput,
  type TailRepairDiagnostics,
  type TailRepairFeedback,
} from "./tail-repair-processor.js";
import type { TailRepairProgressState } from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";

export type TailWriteDiagnostics = TailRepairDiagnostics | TailReflowDiagnostics;

export interface TailWriteResult {
  updates: Array<{ bulletId: string; text: string }>;
  feedback: TailRepairFeedback[];
  progress: TailRepairProgressState;
  diagnostics: TailWriteDiagnostics;
  writeRejectedReason?: string;
}

export async function processTailWrite(
  workspace: ResumeWorkspace,
  action: ResumeAgentNextAction,
  params: {
    tailGrowths?: readonly TailGrowthInput[];
    lineRewrites?: readonly TailReflowInput[];
  },
  compiler: ResumeCompiler,
): Promise<TailWriteResult | undefined> {
  if (action.mode === "batch_tail_repair" && params.tailGrowths) {
    return processTailRepairBatch(workspace, params.tailGrowths, compiler);
  }
  if (action.mode === "batch_tail_reflow" && params.lineRewrites) {
    return processTailReflowBatch(workspace, params.lineRewrites, compiler);
  }
  return undefined;
}
