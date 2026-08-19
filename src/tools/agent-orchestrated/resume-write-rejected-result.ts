import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { resumeTailRepairLoopGuardKey } from "../../resume/workspace/resume-write-loop-key.js";
import { buildAgentWorkspaceReceipt } from "../../resume/workspace/agent-workspace-view.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import { resumeWriteResultForModel } from "./resume-write-result-for-model.js";

export function resumeWriteRejectedResult(
  workspace: ResumeWorkspace,
  writeRejectedReason: string,
  extra: Record<string, unknown> = {},
) {
  const result = {
    ...buildAgentWorkspaceReceipt(workspace),
    writeRejectedReason,
    ...extra,
  };
  const loopGuardKey = extra.tailRepairDiagnostics
    ? resumeTailRepairLoopGuardKey(workspace)
    : resumeContentProgressKey(workspace);
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(resumeWriteResultForModel(result)),
    }],
    details: {
      ...result,
      loopGuardKey,
      ...(isTailRepairResult(result)
        ? { turnGovernorPhaseKey: "resume_tail_repair" }
        : {}),
    },
  };
}

function isTailRepairResult(result: Record<string, unknown>): boolean {
  const nextAction = result.nextAction;
  return Boolean(nextAction && typeof nextAction === "object" &&
    (nextAction as { mode?: unknown }).mode === "batch_tail_repair");
}
