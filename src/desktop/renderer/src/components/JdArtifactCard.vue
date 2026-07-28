<script setup lang="ts">
import { ArrowUpRight, Briefcase, CheckCircle, XCircle } from "@lucide/vue";

import type { JdArtifactData } from "../../../../desktop/shared/types";

defineProps<{
  artifact: JdArtifactData;
}>();

defineEmits<{
  open: [proposalId: string];
}>();

function statusLabel(status: JdArtifactData["status"]): string {
  if (status === "saved") return "已保存，等待同步";
  if (status === "rejected") return "已拒绝";
  return "等待确认";
}
</script>

<template>
  <button
    class="jd-artifact-card"
    :class="{ 'jd-saved': artifact.status === 'saved', 'jd-rejected': artifact.status === 'rejected' }"
    type="button"
    @click="$emit('open', artifact.proposalId)"
  >
    <span class="jd-artifact-icon" aria-hidden="true">
      <Briefcase :size="18" :stroke-width="1.6" />
    </span>
    <span class="jd-artifact-copy">
      <strong>{{ artifact.title }}</strong>
      <span class="icon-label">
        <CheckCircle
          v-if="artifact.status === 'saved'"
          :size="12"
          :stroke-width="1.8"
          aria-hidden="true"
        />
        <XCircle
          v-else-if="artifact.status === 'rejected'"
          :size="12"
          :stroke-width="1.8"
          aria-hidden="true"
        />
        <Briefcase v-else :size="12" :stroke-width="1.8" aria-hidden="true" />
        {{ statusLabel(artifact.status) }}
        <template v-if="artifact.company"> · {{ artifact.company }}</template>
      </span>
    </span>
    <ArrowUpRight
      class="jd-artifact-open"
      :size="16"
      :stroke-width="1.8"
      aria-hidden="true"
    />
  </button>
</template>
