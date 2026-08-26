import type { ResumeCompiler } from "./compiler-port.js";
import type { ResumeAgentNextAction } from "./agent-next-action.js";
import { processSemanticTailRewriteBatch } from
  "./semantic-tail-rewrite-processor.js";
import type {
  SemanticTailRewriteDiagnostics,
  SemanticTailRewriteFeedback,
  SemanticTailRewriteInput,
} from "./semantic-tail-rewrite-types.js";
import type { TailRepairProgressState } from "./tail-repair-state.js";
import type { ResumeWorkspace } from "./types.js";
import type { ResumeFactNeutralFragment } from "./fact-neutral-types.js";

export type TailWriteDiagnostics = SemanticTailRewriteDiagnostics;

export interface TailWriteResult {
  updates: Array<{ bulletId: string; text: string; evidenceIds: string[] }>;
  feedback: SemanticTailRewriteFeedback[];
  progress: TailRepairProgressState;
  diagnostics: TailWriteDiagnostics;
  factNeutralFragments?: ResumeFactNeutralFragment[];
  writeRejectedReason?: string;
}

export async function processTailWrite(
  workspace: ResumeWorkspace,
  action: ResumeAgentNextAction,
  params: {
    tailRewrites?: readonly SemanticTailRewriteInput[];
  },
  compiler: ResumeCompiler,
): Promise<TailWriteResult | undefined> {
  if (action.mode === "batch_tail_rewrite" && params.tailRewrites) {
    return processSemanticTailRewriteBatch(
      workspace,
      params.tailRewrites,
      compiler,
    );
  }
  return undefined;
}
