import type { AgentMessage } from "@earendil-works/pi-agent-core";

const SNAPSHOT_TOOL = "get_resume_source_snapshot";
const CANDIDATE_TOOLS = new Set([
  "prepare_resume_candidate",
  "patch_resume_candidate",
  "review_resume_candidate",
]);

export async function compactResumeGenerationContext(
  messages: AgentMessage[],
): Promise<AgentMessage[]> {
  try {
    const latestCandidateResult = messages.findLastIndex(
      (message) =>
        message.role === "toolResult" && CANDIDATE_TOOLS.has(message.toolName),
    );
    if (latestCandidateResult < 0) return structuredClone(messages);
    return messages.map((message, index) => {
      if (
        message.role !== "toolResult" ||
        index === latestCandidateResult ||
        (message.toolName === SNAPSHOT_TOOL && index > latestCandidateResult) ||
        (message.toolName !== SNAPSHOT_TOOL && !CANDIDATE_TOOLS.has(message.toolName))
      ) {
        return structuredClone(message);
      }
      const { details: _details, ...safe } = structuredClone(message);
      return {
        ...safe,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              compacted: true,
              toolName: message.toolName,
              instruction:
                "Use the latest resume Workspace result. It contains the complete accepted resume, all active evidence bindings, ranked unused evidence, and current diagnostics.",
            }),
          },
        ],
      } as AgentMessage;
    });
  } catch {
    return messages;
  }
}
