import { ref } from "vue";

import type { JdArtifactData } from "@desktop/types";

export function useJdArtifacts() {
  const jdArtifacts = ref<JdArtifactData[]>([]);
  const activeJd = ref<JdArtifactData>();
  const byConversation = new Map<string, JdArtifactData[]>();

  function add(conversationId: string, data: JdArtifactData): void {
    const list = byConversation.get(conversationId) ?? [];
    const existing = list.findIndex((j) => j.proposalId === data.proposalId);
    if (existing >= 0) list[existing] = data;
    else list.push(data);
    byConversation.set(conversationId, list);
    return syncView(conversationId);
  }

  function updateStatus(
    conversationId: string,
    approvalRequestId: string,
    status: JdArtifactData["status"],
    jdId?: string,
  ): void {
    const list = byConversation.get(conversationId);
    const item = list?.find((j) => j.approvalRequestId === approvalRequestId);
    if (!item) return;
    item.status = status;
    if (jdId) item.jdId = jdId;
    syncView(conversationId);
    if (activeJd.value?.approvalRequestId === approvalRequestId) {
      activeJd.value = { ...item };
    }
  }

  function openDetail(proposalId: string): void {
    const found = jdArtifacts.value.find((j) => j.proposalId === proposalId);
    if (found) activeJd.value = { ...found };
  }

  let activeConversationId: string | undefined;

  function switchConversation(conversationId: string | undefined): void {
    activeConversationId = conversationId;
    jdArtifacts.value = conversationId
      ? [...(byConversation.get(conversationId) ?? [])]
      : [];
    activeJd.value = undefined;
  }

  function clear(): void {
    byConversation.clear();
    jdArtifacts.value = [];
    activeJd.value = undefined;
    activeConversationId = undefined;
  }

  function syncView(conversationId: string): void {
    if (conversationId === activeConversationId) {
      jdArtifacts.value = [...(byConversation.get(conversationId) ?? [])];
    }
  }

  return {
    jdArtifacts,
    activeJd,
    add,
    updateStatus,
    openDetail,
    switchConversation,
    clear,
  };
}
