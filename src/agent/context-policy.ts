import type { AgentMessage } from "@earendil-works/pi-agent-core";

const SOURCE_TOOLS = new Set(["create_resume_workspace"]);
const WORKSPACE_TOOLS = new Set([
  "create_resume_workspace",
  "get_resume_workspace",
  "assess_resume_evidence",
  "apply_resume_content",
  "add_resume_material",
  "confirm_no_resume_material",
  "pause_resume_for_material",
  "decline_resume_material",
  "prepare_experience_sync",
]);
const DISCOVERY_TOOLS = new Set([
  "search_jds",
  "get_jd",
  "search_experiences",
  "get_experience",
]);

export async function compactResumeGenerationContext(
  messages: AgentMessage[],
): Promise<AgentMessage[]> {
  try {
    // Before a source snapshot exists, every discovery result in the current
    // user turn remains available for semantic selection. Once the snapshot
    // exists it supersedes detail reads; only search results remain useful for
    // deciding whether an underfilled draft should expand its source set.
    const latestUser = messages.findLastIndex((message) => message.role === "user");
    let latestSource = -1;
    let sourceCount = 0;
    let latestWorkspace = -1;
    let latestError = -1;
    messages.forEach((message, index) => {
      if (message.role !== "toolResult") return;
      if (SOURCE_TOOLS.has(message.toolName)) {
        latestSource = index;
        if (index > latestUser) sourceCount += 1;
      }
      if (!message.isError && WORKSPACE_TOOLS.has(message.toolName)) {
        latestWorkspace = index;
      }
      if (message.isError && index > latestWorkspace) latestError = index;
      if (!message.isError && WORKSPACE_TOOLS.has(message.toolName)) {
        latestError = -1;
      }
    });
    const continuationPhase = isResumeContinuationAuthority(
      messages[latestWorkspace],
    );
    const managedResultIds = new Set<string>();
    const retainedResultIds = new Set<string>();
    messages.forEach((message, index) => {
      if (message.role !== "toolResult" || !isManagedTool(message.toolName)) return;
      managedResultIds.add(message.toolCallId);
      if (
        (!continuationPhase && index === latestSource) ||
        index === latestWorkspace ||
        index === latestError ||
        (!continuationPhase && retainDiscoveryResult(
          message.toolName, index, latestUser, latestSource, sourceCount,
        ))
      ) retainedResultIds.add(message.toolCallId);
    });
    const compacted: AgentMessage[] = [];
    for (const message of messages) {
      if (message.role === "toolResult") {
        if (
          managedResultIds.has(message.toolCallId) &&
          !retainedResultIds.has(message.toolCallId)
        ) continue;
        compacted.push(structuredClone(message));
        continue;
      }
      if (message.role !== "assistant") {
        compacted.push(structuredClone(message));
        continue;
      }
      const managedCallIds = message.content.flatMap((part) =>
        part.type === "toolCall" && managedResultIds.has(part.id)
          ? [part.id]
          : [],
      );
      const retainsManagedCall = managedCallIds.some(
        (id) => retainedResultIds.has(id),
      );
      const content: typeof message.content = [];
      for (const part of message.content) {
        if (part.type !== "toolCall") {
          // Text next to a superseded managed call is its planning narration,
          // not durable conversation state. Keeping it caused large candidate
          // lists to survive after their tool call and result were compacted.
          if (!managedCallIds.length || retainsManagedCall) {
            content.push(structuredClone(part));
          }
          continue;
        }
        if (
          managedResultIds.has(part.id) &&
          !retainedResultIds.has(part.id)
        ) continue;
        const cloned = structuredClone(part);
        if (cloned.type === "toolCall" &&
          cloned.name === "apply_resume_content") {
          cloned.arguments = compactTailRepairArguments(
            cloned.arguments,
          );
        }
        content.push(cloned);
      }
      if (content.length) compacted.push({ ...structuredClone(message), content });
    }
    return compacted;
  } catch {
    return messages;
  }
}

function isResumeContinuationAuthority(
  message: AgentMessage | undefined,
): boolean {
  if (message?.role !== "toolResult" || !message.details ||
    typeof message.details !== "object") return false;
  const nextAction = (message.details as { nextAction?: unknown }).nextAction;
  if (!nextAction || typeof nextAction !== "object") return false;
  const mode = (nextAction as { mode?: unknown }).mode;
  return mode === "adapt_reused_content" || mode === "increase_usage" ||
    mode === "assess_evidence" ||
    mode === "batch_tail_rewrite" ||
    mode === "reduce_overflow" || mode === "repair_bullet_counts";
}

function compactTailRepairArguments(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const isTail = Array.isArray(value.tailRewrites) ||
    Array.isArray(value.tailGrowths);
  const submissions = isTail
    ? (value.tailRewrites ?? value.tailGrowths) as unknown[]
    : Array.isArray(value.lineExpansions)
      ? value.lineExpansions
      : undefined;
  if (!submissions) return value;
  return {
    ...(typeof value.candidateId === "string"
      ? { candidateId: value.candidateId }
      : {}),
    ...(typeof value.expectedRevision === "number"
      ? { expectedRevision: value.expectedRevision }
      : {}),
    [isTail ? "historicalTailSubmission" : "historicalLineSubmission"]: {
      bulletIds: submissions.flatMap((entry) => {
        const candidate = entry && typeof entry === "object"
          ? entry as Record<string, unknown>
          : undefined;
        return typeof candidate?.bulletId === "string"
          ? [candidate.bulletId]
          : [];
      }),
      supersededByFollowingToolResult: true,
    },
  };
}

function isManagedTool(toolName: string): boolean {
  return SOURCE_TOOLS.has(toolName) ||
    WORKSPACE_TOOLS.has(toolName) ||
    DISCOVERY_TOOLS.has(toolName);
}

function retainDiscoveryResult(
  toolName: string,
  index: number,
  latestUser: number,
  latestSource: number,
  sourceCount: number,
): boolean {
  if (!DISCOVERY_TOOLS.has(toolName) || index <= latestUser) return false;
  return latestSource < 0 ||
    (toolName === "search_experiences" && sourceCount < 2);
}

/**
 * 剥离所有 assistant 消息中的 thinking（推理）内容：历史推理不含必要信息，
 * 是长链退化与上下文膨胀的主要来源（S4.5.1）。工具调用与文本保留。
 */
export function stripThinkingParts(messages: AgentMessage[]): AgentMessage[] {
  let changed = false;
  const stripped = messages.map((message) => {
    if (message.role !== "assistant") return message;
    const content = message.content.filter((part) => part.type !== "thinking");
    if (content.length === message.content.length) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? stripped : messages;
}
