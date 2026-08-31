import { ref, watch, type Ref } from "vue";

import type {
  ConversationDetail,
  ConversationSummary,
  ConversationsDesktopApi,
  ResumeDraftDetail,
  ResumeChatReference,
} from "../../../shared/types.js";
import { desktopErrorMessage } from "../chat/desktop-error-message.js";
import { latestLinkedConversation } from
  "../chat/resume-conversation-navigation.js";

type AppView = "chat" | "agent_tasks" | "experiences" | "library" | "tracker";

interface SessionPort {
  authenticatedReady: Ref<boolean>;
  conversations: Ref<ConversationSummary[]>;
  current: Ref<ConversationDetail | undefined>;
  running: Ref<boolean>;
  runError: Ref<string | undefined>;
  createConversation(): Promise<void>;
  selectConversation(id: string): Promise<void>;
  reloadConversation(id: string): Promise<void>;
}

interface WorkspacePort {
  activeDraft: Ref<ResumeDraftDetail | undefined>;
  openDraft(id: string): Promise<ResumeDraftDetail | undefined>;
  refreshActive(): Promise<void>;
}

interface PreviewPort {
  resumeOperationContext: Ref<ResumeChatReference | undefined>;
  activateLocalResumeContext(draft: ResumeDraftDetail): void;
  clearResumeOperationContext(): void;
  resetResumePreview(): void;
}

interface Options {
  session: SessionPort;
  workspace: WorkspacePort;
  preview: PreviewPort;
  activeView: Ref<AppView>;
  activeArtifactType: Ref<"resume" | "jd" | "match">;
  artifactOpen: Ref<boolean>;
  closeNarrowSidebar(): void;
  conversationsApi: ConversationsDesktopApi;
}

export function useResumeConversationContext(options: Options) {
  const resetConfirmation = ref(false);
  const resettingContext = ref(false);

  watch(options.session.authenticatedReady, (ready) => {
    if (ready) void restoreCurrentResumeContext();
  });

  async function openResumeDraft(
    artifactId: string,
    resetPreview = true,
  ): Promise<void> {
    if (resetPreview) options.preview.resetResumePreview();
    prepareResumeView();
    const initial = await options.workspace.openDraft(artifactId);
    if (!initial) return;
    const linked = latestLinkedConversation(
      initial,
      options.session.conversations.value,
    );
    await linkAndSelect(artifactId, linked?.id);
    const current = await options.workspace.openDraft(artifactId) ?? initial;
    options.preview.activateLocalResumeContext(current);
  }

  async function restoreCurrentResumeContext(): Promise<boolean> {
    const artifactId = options.session.current.value?.activeResumeArtifactId;
    if (!artifactId) return false;
    const draft = await options.workspace.openDraft(artifactId);
    if (!draft) return false;
    prepareResumeView();
    options.preview.activateLocalResumeContext(draft);
    return true;
  }

  async function selectChat(conversationId: string): Promise<void> {
    options.preview.resetResumePreview();
    options.activeView.value = "chat";
    options.artifactOpen.value = false;
    options.closeNarrowSidebar();
    await options.session.selectConversation(conversationId);
    await restoreCurrentResumeContext();
  }

  async function createChat(): Promise<void> {
    options.preview.resetResumePreview();
    options.activeView.value = "chat";
    options.artifactOpen.value = false;
    options.closeNarrowSidebar();
    await options.session.createConversation();
  }

  function requestContextReset(): void {
    if (!localReference() || options.session.running.value) return;
    resetConfirmation.value = true;
  }

  async function confirmContextReset(): Promise<void> {
    const reference = localReference();
    if (!reference || resettingContext.value) return;
    resettingContext.value = true;
    try {
      const created = await options.conversationsApi.createForResume(
        reference.artifactId,
      );
      await options.session.reloadConversation(created.id);
      await options.workspace.refreshActive();
      const draft = options.workspace.activeDraft.value;
      if (draft) options.preview.activateLocalResumeContext(draft);
      resetConfirmation.value = false;
      prepareResumeView();
    } catch (error: unknown) {
      options.session.runError.value = desktopErrorMessage(error);
    } finally {
      resettingContext.value = false;
    }
  }

  async function clearResumeOperationContext(): Promise<void> {
    const conversationId = options.session.current.value?.id;
    try {
      if (conversationId) {
        await options.conversationsApi.clearResumeContext(conversationId);
        await options.session.reloadConversation(conversationId);
      }
      options.preview.clearResumeOperationContext();
    } catch (error: unknown) {
      options.session.runError.value = desktopErrorMessage(error);
    }
  }

  async function linkAndSelect(
    artifactId: string,
    conversationId?: string,
  ): Promise<void> {
    const detail = conversationId
      ? await options.conversationsApi.bindResume({ conversationId, artifactId })
      : await options.conversationsApi.createForResume(artifactId);
    await options.session.reloadConversation(detail.id);
  }

  function localReference(): ResumeChatReference | undefined {
    const reference = options.preview.resumeOperationContext.value;
    return reference?.source === "local" ? reference : undefined;
  }

  function prepareResumeView(): void {
    options.closeNarrowSidebar();
    options.activeView.value = "chat";
    options.activeArtifactType.value = "resume";
    options.artifactOpen.value = true;
  }

  return {
    clearResumeOperationContext,
    confirmContextReset,
    createChat,
    openResumeDraft,
    requestContextReset,
    resetConfirmation,
    resettingContext,
    restoreCurrentResumeContext,
    selectChat,
  };
}
