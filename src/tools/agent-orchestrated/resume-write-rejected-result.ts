import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
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
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(resumeWriteResultForModel(result)),
    }],
    details: {
      ...result,
      loopGuardKey: resumeContentProgressKey(workspace),
    },
  };
}
