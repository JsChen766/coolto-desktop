import type { Ref } from "vue";
import type { JdChatReference } from "@desktop/types";

import type { AppView } from "./use-app-shell";
import { useDeliveryResumeActions } from "./use-delivery-resume-actions";
import { useExperienceImportNavigation } from "./use-experience-import-navigation";
import { useJobFlowNavigation } from "./use-job-flow-navigation";

export function useWorkspaceFlows(input: {
  activeView: Ref<AppView>;
  closeNarrowSidebar(): void;
  createChat(): Promise<void>;
  selectConversation(conversationId: string): Promise<void>;
  send(text: string, reference?: JdChatReference): Promise<void>;
  setError(message: string): void;
}) {
  const jobFlow = useJobFlowNavigation(input);
  const deliveryResume = useDeliveryResumeActions({
    openFile: jobFlow.openDeliveryResumeFile,
    createChat: input.createChat,
    send: (text) => input.send(text),
    setError: input.setError,
  });
  const experienceImport = useExperienceImportNavigation({
    activeView: input.activeView,
    closeNarrowSidebar: input.closeNarrowSidebar,
    selectConversation: input.selectConversation,
  });
  return { jobFlow, deliveryResume, experienceImport };
}
