import type { ShouldStopAfterTurnContext } from "@earendil-works/pi-agent-core";

import { resumeAgentNextAction } from "../../resume/workspace/agent-next-action.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

const USER_BOUNDARY_MODES = new Set([
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
    if (!workspace) return false;
    const action = resumeAgentNextAction(workspace);
    if (action.mode !== "request_more_material") {
      return USER_BOUNDARY_MODES.has(action.mode);
    }
    return typeof action.question === "string" &&
      assistantText(context.message).includes(action.question);
  };
}

function assistantText(
  message: ShouldStopAfterTurnContext["message"],
): string {
  return message.content.flatMap((part) =>
    part.type === "text" ? [part.text] : []
  ).join("\n");
}
