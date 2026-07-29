<script setup lang="ts">
import {
  ApplicationTrackerView,
  ConversationDialog,
  JobRepositoryView,
  LoginScreen,
  Sidebar,
} from "./app/app-components";
import AppChatWorkspace from "./app/AppChatWorkspace.vue";
import { useAppShell } from "./app/use-app-shell";
import ResumePreviewChoiceDialog from "./components/ResumePreviewChoiceDialog.vue";
import CloudResumeCopyDialog from "./components/CloudResumeCopyDialog.vue";

const shell = useAppShell();
const {
  activeView,
  booting,
  confirmDialog,
  conversations,
  createChat,
  current,
  dark,
  desktopApi,
  dialog,
  emailChallenge,
  login,
  loginBusy,
  loginError,
  logout,
  chooseResumePreview,
  cloudCopyConfirmation,
  confirmCloudResumeCopy,
  openDialog,
  openLibrary,
  openResumeDraft,
  openTracker,
  openRepositoryTracker,
  closeTracker,
  openTrackerAsset,
  startJdAction,
  trackerContext,
  jobRepositoryNavigation,
  updateRepositoryNavigation,
  requestEmailCode,
  requestResumePreview,
  resumePreviewChoice,
  resumeOperationContext,
  resumeWorkspace,
  selectChat,
  sidebarOpen,
  showSidebar,
  toggleTheme,
  user,
  verifyEmailCode,
} = shell;

function recordFromRepository(
  initial: Parameters<typeof openRepositoryTracker>[1],
  asset: Parameters<typeof openRepositoryTracker>[0],
): void {
  openRepositoryTracker(asset, initial);
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
    :challenge="emailChallenge"
    @password-login="login"
    @request-code="requestEmailCode"
    @verify-code="verifyEmailCode"
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
      :active-view="activeView"
      @create="createChat"
      @select="selectChat"
      @select-draft="openResumeDraft"
      @open-library="openLibrary"
      @open-tracker="openTracker"
      @rename="openDialog('rename', $event)"
      @delete="openDialog('delete', $event)"
      @toggle-theme="toggleTheme"
      @logout="logout"
    />
    <button
      v-if="sidebarOpen"
      class="sidebar-scrim"
      type="button"
      aria-label="关闭侧栏"
      @click="sidebarOpen = false"
    />

    <main class="main-workspace">
      <ApplicationTrackerView
        v-if="activeView === 'tracker'"
        :context="trackerContext"
        @close="closeTracker"
        @open-asset="openTrackerAsset"
      />
      <JobRepositoryView
        v-else-if="activeView === 'library'"
        :navigation="jobRepositoryNavigation"
        @open="requestResumePreview"
        @toggle-sidebar="showSidebar"
        @navigate="updateRepositoryNavigation"
        @agent="startJdAction"
        @record="recordFromRepository"
        @tracker="openRepositoryTracker"
      />
      <AppChatWorkspace v-else :shell="shell" />
    </main>

    <ConversationDialog
      v-if="dialog"
      :mode="dialog.mode"
      :title="dialog.conversation.title"
      @close="dialog = undefined"
      @confirm="confirmDialog"
    />
    <ResumePreviewChoiceDialog
      v-if="resumePreviewChoice"
      :entry="resumePreviewChoice"
      @close="resumePreviewChoice = undefined"
      @local="chooseResumePreview('local')"
      @cloud="chooseResumePreview('cloud')"
    />
    <CloudResumeCopyDialog
      v-if="cloudCopyConfirmation && resumeOperationContext"
      :title="resumeOperationContext.label"
      @close="cloudCopyConfirmation = false"
      @confirm="confirmCloudResumeCopy"
    />
  </div>
</template>
