import { nextTick, ref, watch, type Ref } from "vue";

import type { ExperienceImportResultArtifact } from "../../../../import/result-artifact.js";
import type { ExperienceImportFocus } from "../experiences/experience-import-focus";
import type { AppView } from "./use-app-shell";

interface ExperienceImportNavigationOptions {
  activeView: Ref<AppView>;
  closeNarrowSidebar: () => void;
  selectConversation: (conversationId: string) => Promise<void>;
}

export function useExperienceImportNavigation(
  options: ExperienceImportNavigationOptions,
) {
  const focus = ref<ExperienceImportFocus>();

  function open(
    conversationId: string | undefined,
    artifact: ExperienceImportResultArtifact,
  ): void {
    if (!conversationId || !artifact.saved.length) return;
    focus.value = {
      conversationId,
      proposalId: artifact.proposalId,
      experienceIds: artifact.saved.map((item) => item.experienceId),
    };
    options.closeNarrowSidebar();
    options.activeView.value = "experiences";
  }

  async function returnToConversation(): Promise<void> {
    const origin = focus.value;
    if (!origin) return;
    focus.value = undefined;
    options.closeNarrowSidebar();
    options.activeView.value = "chat";
    await options.selectConversation(origin.conversationId);
    await nextTick();
    document.getElementById(resultElementId(origin.proposalId))
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function clear(): void {
    focus.value = undefined;
  }

  watch(options.activeView, (view, previous) => {
    if (previous === "experiences" && view !== "experiences") clear();
  });

  return { clear, focus, open, returnToConversation };
}

export function resultElementId(proposalId: string): string {
  return `experience-import-result-${proposalId}`;
}
