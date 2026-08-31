import type { ConversationSummary } from "../../../shared/types.js";
import type { ResumeDraftSummary } from "../../../../resume/draft/types.js";

export function latestLinkedConversation(
  draft: Pick<ResumeDraftSummary, "conversationIds">,
  conversations: readonly ConversationSummary[],
): ConversationSummary | undefined {
  const linked = new Set(draft.conversationIds);
  return conversations
    .filter((conversation) => linked.has(conversation.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}
