<script setup lang="ts">
import ChatHeader from "../components/ChatHeader.vue";
import ResumeContextResetDialog from
  "../components/ResumeContextResetDialog.vue";
import type { AppShell } from "./use-app-shell";

const props = defineProps<{ shell: AppShell }>();
const {
  artifactOpen, browser, confirmContextReset, current, exportResume,
  openDialog, requestContextReset, resetConfirmation, resettingContext,
  resumeOperationContext, resumeWorkspace, running, saveResumeToCloud,
  sidebarOpen, toggleArtifact, toggleBrowser,
} = props.shell;

function rename(): void {
  const value = current.value;
  if (!value) return;
  openDialog("rename", {
    id: value.id, title: value.title, createdAt: value.createdAt,
    updatedAt: value.updatedAt, messageCount: value.messageCount,
    ...(value.activeResumeArtifactId
      ? { activeResumeArtifactId: value.activeResumeArtifactId }
      : {}),
  });
}
</script>

<template>
  <ChatHeader
    :title="!current || current.title === '新对话' ? $t('新对话') : current.title"
    :sidebar-open="sidebarOpen"
    :artifact-open="artifactOpen"
    :browser-open="browser.state.isOpen"
    :resume-draft="resumeWorkspace.activeDraft.value"
    :resume-context-active="resumeOperationContext?.source === 'local'"
    :context-reset-disabled="running || resettingContext"
    :exporting="resumeWorkspace.exporting.value"
    :export-message="resumeWorkspace.exportMessage.value"
    :saving-to-library="resumeWorkspace.savingToLibrary.value"
    :save-message="resumeWorkspace.saveMessage.value"
    :line-spacing-percent="resumeWorkspace.lineSpacing.percent.value"
    :line-spacing-maximum="resumeWorkspace.lineSpacing.maximumPercent.value"
    :line-spacing-saving="resumeWorkspace.lineSpacing.saving.value"
    @toggle-sidebar="sidebarOpen = !sidebarOpen"
    @toggle-artifact="toggleArtifact"
    @toggle-browser="toggleBrowser"
    @reset-context="requestContextReset"
    @save-resume="saveResumeToCloud"
    @export-resume="exportResume"
    @preview-line-spacing="resumeWorkspace.lineSpacing.preview"
    @commit-line-spacing="resumeWorkspace.lineSpacing.commit"
    @rename="rename"
  />
  <ResumeContextResetDialog
    v-if="resetConfirmation && resumeOperationContext"
    :title="resumeOperationContext.label"
    :busy="resettingContext"
    @close="resetConfirmation = false"
    @confirm="confirmContextReset"
  />
</template>
