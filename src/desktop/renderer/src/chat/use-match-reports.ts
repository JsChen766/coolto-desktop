import { ref } from "vue";

import type { MatchReportArtifactData } from "@desktop/types";
import { anchorUnassigned } from "@desktop/artifact-anchor";

export function useMatchReports() {
  const matchReports = ref<MatchReportArtifactData[]>([]);
  const activeMatchReport = ref<MatchReportArtifactData>();
  const byConversation = new Map<string, MatchReportArtifactData[]>();

  let activeConversationId: string | undefined;

  function add(conversationId: string, data: MatchReportArtifactData): void {
    const list = byConversation.get(conversationId) ?? [];
    const existing = list.findIndex((r) => r.reportId === data.reportId);
    if (existing >= 0) list[existing] = data;
    else list.push(data);
    byConversation.set(conversationId, list);
    syncView(conversationId);
  }

  function openDetail(reportId: string): void {
    const found = matchReports.value.find((r) => r.reportId === reportId);
    if (found) activeMatchReport.value = { ...found };
  }

  function anchorPending(conversationId: string, messageId?: string): void {
    const list = byConversation.get(conversationId);
    if (!list) return;
    anchorUnassigned(list, messageId);
    syncView(conversationId);
  }

  function switchConversation(conversationId: string | undefined): void {
    activeConversationId = conversationId;
    matchReports.value = conversationId
      ? [...(byConversation.get(conversationId) ?? [])]
      : [];
    activeMatchReport.value = undefined;
  }

  function clear(): void {
    byConversation.clear();
    matchReports.value = [];
    activeMatchReport.value = undefined;
    activeConversationId = undefined;
  }

  function syncView(conversationId: string): void {
    if (conversationId === activeConversationId) {
      matchReports.value = [...(byConversation.get(conversationId) ?? [])];
    }
  }

  return {
    matchReports,
    activeMatchReport,
    add,
    anchorPending,
    openDetail,
    switchConversation,
    clear,
  };
}
