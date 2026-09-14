<script setup lang="ts">
import { nextTick, ref } from "vue";

import {
  ConversationDialog,
  LoginScreen,
  Sidebar,
} from "./app/app-components";
import AppMainWorkspace from "./app/AppMainWorkspace.vue";
import { useAppLifecycle } from "./app/use-app-lifecycle";
import { useAppShell } from "./app/use-app-shell";
import { usePrivacyGate } from "./privacy/use-privacy-gate";
import ResumePreviewChoiceDialog from "./components/ResumePreviewChoiceDialog.vue";
import CloudResumeCopyDialog from "./components/CloudResumeCopyDialog.vue";
import PrivacyGateShell from "./components/PrivacyGateShell.vue";
import ProfileDialog from "./components/ProfileDialog.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import PreferenceDialog from "./components/PreferenceDialog.vue";
import CreditsHost from "./components/CreditsHost.vue";
import WindowTitleBar from "./components/WindowTitleBar.vue";
import ForcedUpdateDialog from "./components/ForcedUpdateDialog.vue";
import OnboardingWorkspace from "./onboarding/OnboardingWorkspace.vue";
import { useOnboarding } from "./onboarding/use-onboarding";

const shell = useAppShell();
const {
  accept: acceptPrivacy,
  decline: declinePrivacy,
  open: privacyGateOpen,
  recoveryOpen: deletionRecoveryOpen,
  state: privacyState,
} = usePrivacyGate(shell);
const mainWorkspace = ref<InstanceType<typeof AppMainWorkspace>>();
const firstVisit = ref(localStorage.getItem("coolto-visited") === null);
const {
  closePreferences,
  closeProfile,
  guardNavigation,
  openPreferences,
  openPreferencesFromSettings,
  openProfile,
  openProfileFromSettings,
  openTaskFromSettings,
  preferenceDialogOpen,
  profileDialogOpen,
  requestPrimaryView,
  settingsDialogOpen,
} = useAppLifecycle(shell, mainWorkspace, firstVisit);
const {
  activeView,
  booting,
  chooseResumePreview,
  cloudCopyConfirmation,
  confirmCloudResumeCopy,
  confirmDialog,
  conversations,
  createChat,
  current,
  dark,
  desktopApi,
  dialog,
  emailChallenge,
  installUpdate,
  loginBusy,
  loginError,
  logout,
  openDialog,
  openResumeDraft,
  requestEmailCode,
  resumeOperationContext,
  resumePreviewChoice,
  resumeWorkspace,
  running,
  selectChat,
  sidebarOpen,
  toggleTheme,
  updateChecking,
  updateState,
  updateUpToDate,
  checkUpdate,
  user,
  verifyEmailCode,
  openTracker,
  openPrimaryView,
} = shell;
const onboarding = useOnboarding(shell);
const creditsHost = ref<InstanceType<typeof CreditsHost>>();

function closeSettings(): void {
  settingsDialogOpen.value = false;
  void nextTick(() => document.querySelector<HTMLElement>(".user-menu-trigger")?.focus());
}
</script>

<template>
  <div class="app-frame" :class="[`platform-${desktopApi.platform}`]">
    <WindowTitleBar v-if="desktopApi.platform !== 'darwin'" />
    <ForcedUpdateDialog
      :state="updateState"
      @install="installUpdate"
      @retry="checkUpdate"
    />
    <div v-if="booting" class="boot-screen">
      <div class="boot-pulse" />
    </div>
    <PrivacyGateShell
      v-else-if="deletionRecoveryOpen || privacyGateOpen"
      :api="desktopApi"
      :gate-open="privacyGateOpen"
      :recovery-open="deletionRecoveryOpen"
      :state="privacyState"
      :busy="loginBusy"
      :error="loginError"
      :authenticated="Boolean(user)"
      @agree="acceptPrivacy"
      @decline="declinePrivacy"
      @logout="logout"
    />
    <LoginScreen
      v-else-if="!user"
      :busy="loginBusy"
      :error="loginError"
      :challenge="emailChallenge"
      :first-visit="firstVisit"
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
        :generating="running || onboarding.blocking.value"
        :update-state="updateState"
        :update-checking="updateChecking"
        :update-up-to-date="updateUpToDate"
        :credits="creditsHost?.totalCredits"
        :unlimited="creditsHost?.unlimited === true"
        @create="guardNavigation(createChat)"
        @select="guardNavigation(() => selectChat($event))"
        @select-draft="guardNavigation(() => openResumeDraft($event))"
        @open-experiences="requestPrimaryView('experiences')"
        @open-agent-tasks="requestPrimaryView('agent_tasks')"
        @open-library="requestPrimaryView('library')"
        @open-material="guardNavigation(() => openPrimaryView('material'))"
        @open-tracker="guardNavigation(openTracker)"
        @rename="openDialog('rename', $event)"
        @delete="openDialog('delete', $event)"
        @toggle-theme="toggleTheme"
        @open-profile="openProfile"
        @open-settings="settingsDialogOpen = true"
        @open-credits="creditsHost?.open()"
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
      <OnboardingWorkspace
        v-if="onboarding.blocking.value"
        :shell="shell"
        :controller="onboarding"
      />
      <AppMainWorkspace v-else ref="mainWorkspace" :shell="shell" />
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
      <ProfileDialog v-if="profileDialogOpen" :api="desktopApi" @close="closeProfile" />
      <PreferenceDialog v-if="preferenceDialogOpen" :api="desktopApi" @close="closePreferences" />
      <SettingsDialog
        v-if="settingsDialogOpen"
        :api="desktopApi"
        :conversation-id="current?.id ?? ''"
        @close="closeSettings"
        @open-profile="openProfileFromSettings"
        @open-preferences="openPreferencesFromSettings"
        @open-agent-task="openTaskFromSettings"
        @open-credits="creditsHost?.open()"
      />
      <CreditsHost ref="creditsHost" :api="desktopApi" :user="user" />
    </div>
  </div>
</template>
