import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { createRunTerminal } from "./agent-run-terminal.js";

export function createRunTerminalForContext(
  context: ConversationAgentContext,
  cancelled: boolean,
  error?: unknown,
) {
  const workspace = context.workspaceStore.latest();
  const artifactId = context.activeEdit?.artifactId ?? (workspace
    ? context.artifactIdByCandidate.get(workspace.candidateId)
    : undefined);
  return createRunTerminal({
    cancelled,
    ...(workspace ? { workspaceStatus: workspace.status } : {}),
    ...(artifactId ? { artifactId } : {}),
    ...(error === undefined ? {} : { error }),
  });
}
