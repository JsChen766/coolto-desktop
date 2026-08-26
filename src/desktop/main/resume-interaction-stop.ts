import type { ShouldStopAfterTurnContext } from "@earendil-works/pi-agent-core";

import { resumeAgentNextAction } from "../../resume/workspace/agent-next-action.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

const USER_BOUNDARY_MODES = new Set([
  "request_more_material",
  "stop_insufficient_material",
  "await_augmented_confirmation",
]);

/** Stops Pi before it polls follow-up queues once the assistant reaches a user boundary. */
export function createResumeInteractionStop(
  store: ResumeWorkspaceStore,
): (context: ShouldStopAfterTurnContext) => boolean {
  return (context) => {
    if (context.toolResults.length) return false;
    const workspace = store.latest();
    return workspace
      ? USER_BOUNDARY_MODES.has(resumeAgentNextAction(workspace).mode)
      : false;
  };
}
