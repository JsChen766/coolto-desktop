import type { ShouldStopAfterTurnContext } from "@earendil-works/pi-agent-core";

import { resumeAgentNextAction } from "../../resume/workspace/agent-next-action.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { hasNoMoreResumeMaterialIntent } from "./no-material-intent.js";
import { crossedResumeMaterialBoundary } from
  "./resume-material-boundary.js";

const USER_BOUNDARY_MODES = new Set([
  "stop_insufficient_material",
  "await_augmented_confirmation",
]);

/** Stops Pi before it polls follow-up queues once the assistant reaches a user boundary. */
export function createResumeInteractionStop(
  store: ResumeWorkspaceStore,
  currentUserMessageText: () => string | undefined = () => undefined,
): (context: ShouldStopAfterTurnContext) => boolean {
  return (context) => {
    const workspace = store.latest();
    if (!workspace) return false;
    const action = resumeAgentNextAction(workspace);
    if (action.mode === "stop_insufficient_material" &&
      hasNoMoreResumeMaterialIntent(currentUserMessageText())) {
      return false;
    }
    if (action.mode === "request_more_material") {
      return crossedResumeMaterialBoundary(context.toolResults);
    }
    if (context.toolResults.length) return false;
    return USER_BOUNDARY_MODES.has(action.mode);
  };
}
