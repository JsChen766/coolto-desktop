import type { ChatMessage } from "./types.js";

export interface MessageAnchoredArtifact {
  anchorMessageId?: string;
}

export function inferArtifactAnchor(
  messages: ChatMessage[],
  createdAt: string,
): string | undefined {
  const assistants = messages.filter((message) => message.role === "assistant");
  if (assistants.length === 0) return undefined;
  const created = Date.parse(createdAt);
  if (Number.isFinite(created)) {
    const following = assistants.find(
      (message) => Date.parse(message.createdAt) >= created,
    );
    if (following) return following.id;
  }
  return assistants.at(-1)?.id;
}

export function latestNewAssistantMessageId(
  messages: ChatMessage[],
  previousMessageIds: ReadonlySet<string>,
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === "assistant" &&
      !previousMessageIds.has(message.id)
    ) {
      return message.id;
    }
  }
  return undefined;
}

export function anchorUnassigned<T extends MessageAnchoredArtifact>(
  artifacts: T[],
  messageId: string | undefined,
): void {
  if (!messageId) return;
  for (const artifact of artifacts) {
    artifact.anchorMessageId ??= messageId;
  }
}
