<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import {
  ApplicationTrackerView,
  ConversationDialog,
  ExperienceLibraryView,
  JobRepositoryView,
  LoginScreen,
  Sidebar,
} from "./app/app-components";
import AppChatWorkspace from "./app/AppChatWorkspace.vue";
import { useAppShell } from "./app/use-app-shell";
import ResumePreviewChoiceDialog from "./components/ResumePreviewChoiceDialog.vue";
import CloudResumeCopyDialog from "./components/CloudResumeCopyDialog.vue";
import PrivacyConsentDialog from "./components/PrivacyConsentDialog.vue";
import ProfileDialog from "./components/ProfileDialog.vue";
import SettingsDialog from "./components/SettingsDialog.vue";

const shell = useAppShell();
const experienceLibraryView = ref<InstanceType<typeof ExperienceLibraryView>>();
const profileDialogOpen = ref(false);
const profileTrigger = ref<HTMLElement>();
const settingsDialogOpen = ref(false);
const privacyConsent = ref(localStorage.getItem("coolto-privacy-consent") === "1");
const firstVisit = ref(localStorage.getItem("coolto-visited") === null);
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
  experienceImportFocus,
  login,
  loginBusy,
  loginError,
  logout,
  chooseResumePreview,
  cloudCopyConfirmation,
  confirmCloudResumeCopy,
  openDialog,
  openPrimaryView,
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
  returnToImportConversation,
  clearExperienceImportFocus,
  running,
  selectChat,
  sidebarOpen,
  showSidebar,
  toggleTheme,
  updateChecking,
  updateState,
  updateUpToDate,
  checkUpdate,
  installUpdate,
  user,
  verifyEmailCode,
} = shell;

function recordFromRepository(
  initial: Parameters<typeof openRepositoryTracker>[1],
  asset: Parameters<typeof openRepositoryTracker>[0],
): void {
  openRepositoryTracker(asset, initial);
}

function guardNavigation(action: () => void | Promise<void>): void {
  void (async () => {
    if (running) return;
    if (
      activeView.value === "experiences"
      && (await experienceLibraryView.value?.confirmLeave()) === false
    ) return;
    await action();
  })();
}

function requestPrimaryView(view: "experiences" | "library"): void {
  if (activeView.value === view) return;
  guardNavigation(() => openPrimaryView(view));
}

function openProfile(trigger: HTMLElement): void {
  profileTrigger.value = trigger;
  profileDialogOpen.value = true;
}

function openProfileFromSettings(): void {
  const trigger = document.querySelector(".user-menu-trigger") as HTMLElement | null;
  openProfile(trigger ?? document.body);
}

function closeProfile(): void {
  profileDialogOpen.value = false;
  void nextTick(() => profileTrigger.value?.focus());
}

function acceptPrivacy(): void {
  localStorage.setItem("coolto-privacy-consent", "1");
  privacyConsent.value = true;
}

watch(user, (next, previous) => {
  if (previous && !next) firstVisit.value = false;
});
</script>

<template>
  <div v-if="booting" class="boot-screen">
    <div class="boot-pulse" />
  </div>

  <PrivacyConsentDialog
    v-else-if="!user && !privacyConsent"
    @agree="acceptPrivacy"
  />

  <LoginScreen
    v-else-if="!user"
    :busy="loginBusy"
    :error="loginError"
    :challenge="emailChallenge"
    :first-visit="firstVisit"
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
      :generating="running"
      :update-state="updateState"
      :update-checking="updateChecking"
      :update-up-to-date="updateUpToDate"
      @create="guardNavigation(createChat)"
      @select="guardNavigation(() => selectChat($event))"
      @select-draft="guardNavigation(() => openResumeDraft($event))"
      @open-experiences="requestPrimaryView('experiences')"
      @open-library="requestPrimaryView('library')"
      @open-tracker="guardNavigation(openTracker)"
      @rename="openDialog('rename', $event)"
      @delete="openDialog('delete', $event)"
      @toggle-theme="toggleTheme"
      @open-profile="openProfile"
      @open-settings="settingsDialogOpen = true"
      @check-update="checkUpdate"
      @install-update="installUpdate"
      @logout="guardNavigation(logout)"
    />
    <button
      v-if="sidebarOpen"
      class="sidebar-scrim"
      type="button"
      :aria-label="$t('关闭侧栏')"
      @click="sidebarOpen = false"
    />

    <main class="main-workspace">
      <ApplicationTrackerView
        v-if="activeView === 'tracker'"
        :context="trackerContext"
        @close="closeTracker"
        @open-asset="openTrackerAsset"
      />
      <ExperienceLibraryView
        v-else-if="activeView === 'experiences'"
        ref="experienceLibraryView"
        :import-focus="experienceImportFocus"
        @return-import="returnToImportConversation"
        @clear-import-focus="clearExperienceImportFocus"
        @toggle-sidebar="showSidebar"
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
    <ProfileDialog
      v-if="profileDialogOpen"
      :api="desktopApi"
      @close="closeProfile"
    />
    <SettingsDialog
      v-if="settingsDialogOpen"
      :api="desktopApi"
      @close="settingsDialogOpen = false"
      @open-profile="openProfileFromSettings"
    />
  </div>
</template>
