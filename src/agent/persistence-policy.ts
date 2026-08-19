import type { AgentMessage } from "@earendil-works/pi-agent-core";

const TRANSIENT_TOOL_NAMES = new Set([
  "get_resume",
  "create_resume_workspace",
  "get_resume_workspace",
  "apply_resume_content",
  "add_resume_material",
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
  if (toolName === "get_resume") {
    return "This cloud Resume content expired when the task was persisted. Call get_resume again with the exact resumeId before using it.";
  }
  return "This in-memory resume workspace expired when the task was persisted. Call create_resume_workspace again to lock fresh sources; do not reuse the old candidateId or evidence IDs.";
}

function isTransientToolResult(message: AgentMessage): message is AgentMessage & ToolResultLike {
  return (
    message.role === "toolResult" &&
    TRANSIENT_TOOL_NAMES.has(message.toolName)
  );
}
