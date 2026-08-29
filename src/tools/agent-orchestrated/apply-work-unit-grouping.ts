import { buildAgentWorkspaceReceipt } from
  "../../resume/workspace/agent-workspace-view.js";
import { resumeWriteLoopGuardKey } from
  "../../resume/workspace/resume-write-loop-key.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import { applyResumeWorkUnitInputs } from
  "../../resume/workspace/work-unit-map.js";
import type { ResumeWorkUnitInput } from
  "../../resume/workspace/work-unit-types.js";
import { ResumeWorkspaceStore } from
  "../../resume/workspace/workspace-store.js";
import { resumeWriteResultForModel } from "./resume-write-result-for-model.js";
import { resumeWriteRejectedResult } from "./resume-write-rejected-result.js";

export function tryApplyWorkUnitGrouping(
  workspace: ResumeWorkspace,
  inputs: readonly ResumeWorkUnitInput[] | undefined,
  store: ResumeWorkspaceStore,
) {
  if (!inputs) return undefined;
  try {
    return applyWorkUnitGrouping(workspace, inputs, store);
  } catch (error: unknown) {
    return resumeWriteRejectedResult(
      workspace,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function applyWorkUnitGrouping(
  workspace: ResumeWorkspace,
  inputs: readonly ResumeWorkUnitInput[],
  store: ResumeWorkspaceStore,
) {
  const updated = store.replace(
    applyResumeWorkUnitInputs(workspace, inputs),
    workspace.revision,
  );
  const operation = {
    status: "success" as const,
    appliedItemIds: inputs.map((input) => input.itemId),
    rejectedItems: [],
  };
  const result = buildAgentWorkspaceReceipt(
    updated, operation,
  ) as Record<string, unknown>;
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(resumeWriteResultForModel(result)),
    }],
    details: {
      ...result,
      loopGuardKey: resumeWriteLoopGuardKey(updated, operation),
    },
  };
}
