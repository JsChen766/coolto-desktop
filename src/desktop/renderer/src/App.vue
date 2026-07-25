<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

import type { ResumeChatReference } from "@desktop/types";
import type { ResumeLibraryEntry } from "@desktop/types";
import ApprovalCard from "./components/ApprovalCard.vue";
import ArtifactPanel from "./components/ArtifactPanel.vue";
import JdArtifactCard from "./components/JdArtifactCard.vue";
import JdDetailPanel from "./components/JdDetailPanel.vue";
import MatchReportCard from "./components/MatchReportCard.vue";
import MatchReportPanel from "./components/MatchReportPanel.vue";
import ResumeArtifactCard from "./components/ResumeArtifactCard.vue";
import ChatHeader from "./components/ChatHeader.vue";
import ChatMessageView from "./components/ChatMessage.vue";
import Composer from "./components/Composer.vue";
import ConversationDialog from "./components/ConversationDialog.vue";
import EmptyState from "./components/EmptyState.vue";
import LoginScreen from "./components/LoginScreen.vue";
import MarkdownContent from "./components/MarkdownContent.vue";
import Sidebar from "./components/Sidebar.vue";
import ToolActivity from "./components/ToolActivity.vue";
import ResumeLibraryView from "./components/ResumeLibraryView.vue";
import { useChatSession } from "./chat/use-chat-session";
import { useConversationAttachment } from "./attachments/use-conversation-attachment";
import { desktopApi } from "./lib/desktop-api";
import { useResumeWorkspace } from "./resume-workspace/use-resume-workspace";

const sidebarOpen = ref(true);
const artifactOpen = ref(false);
const activeArtifactType = ref<"resume" | "jd" | "match">("resume");
const libraryOpen = ref(false);
const resumeWorkspace = useResumeWorkspace();
const {
  booting,
  user,
  loginBusy,
  loginError,
  conversations,
  current,
  running,
  streamingText,
  runError,
  toolRuns,
  pendingApproval,
  approvalBusy,
  dialog,
  jdArtifacts,
  activeJd,
  matchReports,
  activeMatchReport,
  login,
  logout,
  createConversation,
  selectConversation,
  openDialog,
  confirmDialog,
  send: sendPrompt,
  resolveApproval,
  openJdDetail,
  openMatchDetail,
} = useChatSession(resumeWorkspace);
const conversationAttachment = useConversationAttachment(
  () => current.value?.id,
);
const scroller = ref<HTMLElement>();
const dark = ref(localStorage.getItem("coolto-theme") === "dark");

onMounted(applyTheme);

watch(
  [() => current.value?.messages.length, streamingText, pendingApproval, jdArtifacts, matchReports],
  () => void nextTick(scrollToBottom),
);

async function send(
  text: string,
  resumeReference?: ResumeChatReference,
): Promise<void> {
  await sendPrompt(text, resumeReference);
}

async function openResumeDraft(artifactId: string): Promise<void> {
  activeArtifactType.value = "resume";
  artifactOpen.value = true;
  await resumeWorkspace.openDraft(artifactId);
}

async function openFromLibrary(entry: ResumeLibraryEntry): Promise<void> {
  libraryOpen.value = false;
  if (entry.local) {
    await openResumeDraft(entry.local.artifactId);
  }
  // TODO: cloud_only — 拉取云端内容创建本地草稿后再打开
}

function openJdPanel(proposalId: string): void {
  openJdDetail(proposalId);
  activeArtifactType.value = "jd";
  artifactOpen.value = true;
}

function openMatchPanel(reportId: string): void {
  openMatchDetail(reportId);
  activeArtifactType.value = "match";
  artifactOpen.value = true;
}

async function toggleArtifact(): Promise<void> {
  artifactOpen.value = !artifactOpen.value;
  if (!artifactOpen.value) return;
  if (activeArtifactType.value === "resume") {
    const first = resumeWorkspace.drafts.value[0];
    if (!resumeWorkspace.activeDraft.value && first) {
      await resumeWorkspace.openDraft(first.artifactId);
    }
  }
}

function draftCloudState(artifactId: string) {
  return resumeWorkspace.drafts.value.find(
    (draft) => draft.artifactId === artifactId,
  )?.cloudState;
}

function activeResumeReference(): ResumeChatReference | undefined {
  const draft = resumeWorkspace.activeDraft.value;
  return draft
    ? {
        artifactId: draft.artifactId,
        targetType: "resume",
        targetId: draft.artifactId,
        label: draft.title,
      }
    : undefined;
}

function saveResumeToCloud(): void {
  const reference = activeResumeReference();
  if (reference) void send("请将右侧当前本地简历保存到云端。", reference);
}

function exportResume(): void {
  const reference = activeResumeReference();
  if (reference) void send("请将右侧当前简历导出为 PDF 到本地文件。", reference);
}

function toggleTheme(): void {
  dark.value = !dark.value;
  localStorage.setItem("coolto-theme", dark.value ? "dark" : "light");
  applyTheme();
}

function applyTheme(): void {
  document.documentElement.classList.toggle("dark", dark.value);
}

function scrollToBottom(): void {
  scroller.value?.scrollTo({
    top: scroller.value.scrollHeight,
    behavior: "smooth",
  });
}

</script>

<template>
  <div v-if="booting" class="boot-screen">
    <div class="boot-pulse" />
  </div>

  <LoginScreen
    v-else-if="!user"
    :busy="loginBusy"
    :error="loginError"
    @submit="login"
  />

  <div
    v-else
    class="app-shell"
    :class="[`platform-${desktopApi.platform}`, { 'sidebar-hidden': !sidebarOpen }]"
  >
    <Sidebar
      v-if="sidebarOpen"
      :conversations="conversations"
      :current-id="current?.id"
      :user="user"
      :dark="dark"
      :resume-drafts="resumeWorkspace.drafts.value"
      :current-draft-id="resumeWorkspace.activeDraft.value?.artifactId"
      @create="createConversation"
      @select="selectConversation"
      @select-draft="openResumeDraft"
      @open-library="libraryOpen = true"
      @rename="openDialog('rename', $event)"
      @delete="openDialog('delete', $event)"
      @toggle-theme="toggleTheme"
      @logout="logout"
    />

    <main class="main-workspace">
      <ResumeLibraryView v-if="libraryOpen" @close="libraryOpen = false" @open="openFromLibrary" />
      <template v-else>
      <ChatHeader
        :title="current?.title ?? '新对话'"
        :sidebar-open="sidebarOpen"
        :artifact-open="artifactOpen"
        :resume-draft="resumeWorkspace.activeDraft.value"
        :platform="desktopApi.platform"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @toggle-artifact="toggleArtifact"
        @save-resume="saveResumeToCloud"
        @export-resume="exportResume"
        @rename="
          current &&
          openDialog('rename', {
            id: current.id,
            title: current.title,
            createdAt: current.createdAt,
            updatedAt: current.updatedAt,
            messageCount: current.messageCount,
          })
        "
        @minimize="desktopApi.window.minimize"
        @maximize="desktopApi.window.toggleMaximize"
        @close="desktopApi.window.close"
      />

      <div class="workspace-body">
        <section class="chat-pane">
          <div ref="scroller" class="message-scroller">
            <div v-if="current" class="message-stream">
              <EmptyState
                v-if="current.messages.length === 0 && !running"
                @use-prompt="send"
              />
              <ChatMessageView
                v-for="message in current.messages"
                :key="message.id"
                :message="message"
              />
              <ResumeArtifactCard
                v-for="artifact in current.resumeArtifacts"
                :key="artifact.artifactId"
                :artifact="artifact"
                :cloud-state="draftCloudState(artifact.artifactId)"
                @open="openResumeDraft"
              />
              <JdArtifactCard
                v-for="jdArtifact in jdArtifacts"
                :key="jdArtifact.proposalId"
                :artifact="jdArtifact"
                @open="openJdPanel"
              />
              <MatchReportCard
                v-for="report in matchReports"
                :key="report.reportId"
                :report="report"
                @open="openMatchPanel"
              />
              <article
                v-if="toolRuns.length || streamingText"
                class="chat-message role-assistant live-response"
              >
                <ToolActivity :runs="toolRuns" />
                <MarkdownContent
                  v-if="streamingText"
                  :content="streamingText"
                />
                <span v-if="running" class="stream-caret" aria-hidden="true" />
              </article>
              <p v-if="runError" class="run-error">{{ runError }}</p>
              <ApprovalCard
                v-if="pendingApproval"
                :request="pendingApproval"
                :busy="approvalBusy"
                @decide="resolveApproval"
              />
            </div>
          </div>
          <Composer
            :disabled="!current"
            :running="running"
            :attachment="conversationAttachment.attachment.value"
            :attachment-busy="conversationAttachment.selecting.value"
            :attachment-error="conversationAttachment.error.value"
            @send="send"
            @cancel="desktopApi.agent.cancel"
            @select-attachment="conversationAttachment.select"
            @remove-attachment="conversationAttachment.remove"
          />
        </section>

        <ArtifactPanel
          v-if="artifactOpen && activeArtifactType === 'resume'"
          :draft="resumeWorkspace.activeDraft.value"
          :busy="resumeWorkspace.busy.value"
          :error="resumeWorkspace.error.value"
          :local-save-state="resumeWorkspace.localSaveState.value"
          @edit="resumeWorkspace.edit"
          @autosave="resumeWorkspace.autosave"
          @restore="resumeWorkspace.restore"
          @accept="resumeWorkspace.resolvePending('accept')"
          @reject="resumeWorkspace.resolvePending('reject')"
        />
        <JdDetailPanel
          v-else-if="artifactOpen && activeArtifactType === 'jd' && activeJd"
          :data="activeJd"
        />
        <MatchReportPanel
          v-else-if="artifactOpen && activeArtifactType === 'match' && activeMatchReport"
          :data="activeMatchReport"
        />
      </div>
      </template>
    </main>

    <ConversationDialog
      v-if="dialog"
      :mode="dialog.mode"
      :title="dialog.conversation.title"
      @close="dialog = undefined"
      @confirm="confirmDialog"
    />
  </div>
</template>
