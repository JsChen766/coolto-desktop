<script setup lang="ts">
import { ArrowUpRight, FileText, HardDrive, RefreshCw } from "@lucide/vue";

import type { ResumeDraftArtifactReference } from "../../../../resume/draft/types";
import { translate } from "../i18n/locale";

defineProps<{
  artifact: ResumeDraftArtifactReference;
  cloudState: "local_only" | "synced" | "local_changes" | undefined;
}>();

defineEmits<{
  open: [artifactId: string];
}>();

function stateLabel(value?: "local_only" | "synced" | "local_changes") {
  if (value === "synced") return translate("已加入简历库");
  if (value === "local_changes") return translate("本地草稿有新修改");
  return translate("本地草稿已自动保存");
}
</script>

<template>
  <button
    class="resume-artifact-card"
    type="button"
    data-testid="resume-draft-status"
    :data-artifact-id="artifact.artifactId"
    :data-revision="artifact.revision ?? ''"
    :data-workspace-status="artifact.workspaceStatus ?? ''"
    :data-page-count="artifact.pageCount ?? ''"
    :data-page-usage-ratio="artifact.usageRatio ?? ''"
    :data-generation-ready="artifact.generationReady === undefined ? '' : String(artifact.generationReady)"
    :data-blocker-codes="artifact.blockerCodes?.join(',') ?? ''"
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
