<script setup lang="ts">
import ArtifactPanel from "../components/ArtifactPanel.vue";
import CloudResumePreviewPanel from "../components/CloudResumePreviewPanel.vue";
import type { AppShell } from "./use-app-shell";

const props = defineProps<{ shell: AppShell }>();
const {
  cloudResumePreview,
  cloudResumePreviewBusy,
  cloudResumePreviewError,
  repositoryResumePreview,
  resumeWorkspace,
  returnToJobRepository,
} = props.shell;
</script>

<template>
  <CloudResumePreviewPanel
    v-if="
      repositoryResumePreview &&
      (cloudResumePreview || cloudResumePreviewBusy || cloudResumePreviewError)
    "
    :preview="cloudResumePreview"
    :busy="cloudResumePreviewBusy"
    :error="cloudResumePreviewError"
    @back="returnToJobRepository"
  />
  <ArtifactPanel
    v-else
    :draft="resumeWorkspace.activeDraft.value"
    :busy="resumeWorkspace.busy.value"
    :error="resumeWorkspace.error.value"
    :local-save-state="resumeWorkspace.localSaveState.value"
    :repository-preview="repositoryResumePreview"
    @edit="resumeWorkspace.edit"
    @autosave="resumeWorkspace.autosave"
    @restore="resumeWorkspace.restore"
    @accept="resumeWorkspace.resolvePending('accept')"
    @reject="resumeWorkspace.resolvePending('reject')"
    @back="returnToJobRepository"
  />
</template>
