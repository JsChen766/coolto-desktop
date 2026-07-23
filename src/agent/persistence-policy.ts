import type { AgentMessage } from "@earendil-works/pi-agent-core";

const TRANSIENT_TOOL_NAMES = new Set([
  "get_resume_source_snapshot",
  "prepare_resume_candidate",
  "patch_resume_candidate",
]);

interface ToolResultLike {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: Array<{ type: string; [key: string]: unknown }>;
  details?: unknown;
  isError: boolean;
  timestamp: number;
  [key: string]: unknown;
}

/**
 * Removes task-local source material before an Agent transcript is persisted.
 * The in-memory Agent state remains untouched; restored tasks must rebuild the
 * snapshot from authenticated business APIs.
 */
export function sanitizeAgentMessagesForPersistence(
  messages: readonly AgentMessage[],
): AgentMessage[] {
  return messages.map((message) => {
    if (!isTransientToolResult(message)) {
      return structuredClone(message);
    }
    const { details: _details, ...safe } = structuredClone(message);
    return {
      ...safe,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            transient: true,
            toolName: message.toolName,
            instruction: expirationInstruction(message.toolName),
          }),
        },
      ],
    } as AgentMessage;
  });
}

function expirationInstruction(toolName: string): string {
  if (toolName === "get_resume_source_snapshot") {
    return "This source snapshot expired when the task was persisted. Call get_resume_source_snapshot again before using source evidence.";
  }
  return "This in-memory resume candidate expired when the task was persisted. Rebuild its sources and call prepare_resume_candidate again; do not reuse the old candidateId or evidence offsets without a fresh snapshot.";
}

function isTransientToolResult(message: AgentMessage): message is AgentMessage & ToolResultLike {
  return (
    message.role === "toolResult" &&
    TRANSIENT_TOOL_NAMES.has(message.toolName)
  );
}
