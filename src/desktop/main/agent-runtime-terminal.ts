import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { createRunTerminal } from "./agent-run-terminal.js";
import { terminalContinuationFor } from "../../resume/workspace/runtime-acceptance-contract.js";
import { resolveResumeTerminalState } from "../../resume/workspace/terminal-state.js";

export function createRunTerminalForContext(
  context: ConversationAgentContext,
  cancelled: boolean,
  error?: unknown,
) {
  const workspace = context.workspaceStore.latest();
  const artifactId = context.activeEdit?.artifactId ?? (workspace
    ? context.artifactIdByCandidate.get(workspace.candidateId)
    : undefined);
  const terminal = createRunTerminal({
    cancelled,
    ...(workspace ? { workspaceStatus: workspace.status } : {}),
    ...(artifactId ? { artifactId } : {}),
    ...(error === undefined ? {} : { error }),
  });
  if (workspace && !cancelled && error === undefined) {
    const state = resolveResumeTerminalState(workspace);
    if (state.kind === "stopped") {
      return {
        ...terminal,
        status: "stopped" as const,
        message: terminalContinuationFor("stopped").text,
        canContinue: false,
      };
    }
    if (state.kind === "ready_for_approval" || state.kind === "needs_user_decision") {
      return {
        ...terminal,
        status: state.kind,
        message: terminalContinuationFor(state.kind).text,
        canContinue: false,
      };
    }
  }
  return terminal;
}
