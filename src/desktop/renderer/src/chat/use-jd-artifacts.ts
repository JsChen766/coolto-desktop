import { ref } from "vue";

import type { JdArtifactData } from "@desktop/types";
import { anchorUnassigned } from "@desktop/artifact-anchor";

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
    const index = list?.findIndex(
      (item) => item.approvalRequestId === approvalRequestId,
    );
    if (!list || index === undefined || index < 0) return;
    const item = list[index];
    if (!item) return;
    const updated: JdArtifactData = {
      ...item,
      status,
      ...(jdId ? { jdId } : {}),
    };
    list[index] = updated;
    byConversation.set(conversationId, list);
    syncView(conversationId);
    if (activeJd.value?.approvalRequestId === approvalRequestId) {
      activeJd.value = { ...updated };
    }
  }

  function openDetail(proposalId: string): void {
    const found = jdArtifacts.value.find((j) => j.proposalId === proposalId);
    if (found) activeJd.value = { ...found };
  }

  function anchorPending(conversationId: string, messageId?: string): void {
    const list = byConversation.get(conversationId);
    if (!list) return;
    anchorUnassigned(list, messageId);
    syncView(conversationId);
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
    anchorPending,
    openDetail,
    switchConversation,
    clear,
  };
}
