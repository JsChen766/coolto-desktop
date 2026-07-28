import type { ConversationSummary } from "../../../shared/types.js";

const UNTITLED_CONVERSATION = "新对话";

export function findReusableEmptyConversation(
  conversations: ConversationSummary[],
): ConversationSummary | undefined {
  return conversations.find(
    (conversation) =>
      conversation.title === UNTITLED_CONVERSATION &&
      conversation.messageCount === 0,
  );
}
