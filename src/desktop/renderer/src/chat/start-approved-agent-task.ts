import type { ConversationDetail, DesktopApi } from "@desktop/types";

export async function startApprovedAgentTask(
  api: DesktopApi,
  conversationId: string,
): Promise<ConversationDetail> {
  const task = (await api.agentTasks.list()).find((item) =>
    item.conversationId === conversationId && item.status === "queued",
  );
  if (task) await api.agentTasks.start(task.id);
  return api.conversations.get(conversationId);
}
