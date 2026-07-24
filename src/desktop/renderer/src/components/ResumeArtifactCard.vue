<script setup lang="ts">
import { ArrowUpRight, FileText, HardDrive, RefreshCw } from "@lucide/vue";

import type { ResumeDraftArtifactReference } from "../../../../resume/draft/types";

defineProps<{
  artifact: ResumeDraftArtifactReference;
  cloudState: "local_only" | "synced" | "local_changes" | undefined;
}>();

defineEmits<{
  open: [artifactId: string];
}>();

function stateLabel(value?: "local_only" | "synced" | "local_changes") {
  if (value === "synced") return "已同步云端";
  if (value === "local_changes") return "有未同步修改";
  return "仅保存在本机";
}
</script>

<template>
  <button
    class="resume-artifact-card"
    type="button"
    @click="$emit('open', artifact.artifactId)"
  >
    <span class="resume-artifact-page" aria-hidden="true">
      <FileText :size="18" :stroke-width="1.6" />
    </span>
    <span class="resume-artifact-copy">
      <strong>{{ artifact.title }}</strong>
      <span class="icon-label">
        <RefreshCw
          v-if="cloudState === 'local_changes'"
          :size="12"
          :stroke-width="1.8"
          aria-hidden="true"
        />
        <HardDrive v-else :size="12" :stroke-width="1.8" aria-hidden="true" />
        {{ stateLabel(cloudState) }}
      </span>
    </span>
    <ArrowUpRight
      class="resume-artifact-open"
      :size="16"
      :stroke-width="1.8"
      aria-hidden="true"
    />
  </button>
</template>
