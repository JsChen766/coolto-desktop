<script setup lang="ts">
import { ArrowRight, CheckCircle2, Sparkles, TriangleAlert } from "@lucide/vue";
import { computed } from "vue";

import type { ExperienceImportResultArtifact } from "../../../../import/result-artifact";
import { presentExperienceImportResult } from "../../../../import/result-presentation";
import { resultElementId } from "../app/use-experience-import-navigation";

const props = defineProps<{ artifact: ExperienceImportResultArtifact }>();
defineEmits<{
  open: [artifact: ExperienceImportResultArtifact];
  generateGeneral: [];
}>();

const view = computed(() => presentExperienceImportResult(props.artifact));
</script>

<template>
  <section
    :id="resultElementId(artifact.proposalId)"
    class="approval-card experience-import-result-card"
    :class="{ partial: artifact.failedCount > 0 }"
    aria-live="polite"
  >
    <header class="approval-heading">
      <div class="approval-icon" aria-hidden="true">
        <CheckCircle2
          v-if="artifact.saved.length"
          :size="18"
          :stroke-width="1.8"
        />
        <TriangleAlert v-else :size="18" :stroke-width="1.8" />
      </div>
      <div>
        <h3>{{ view.title }}</h3>
        <p v-if="artifact.sourceLabel">{{ artifact.sourceLabel }}</p>
      </div>
    </header>
    <p class="experience-import-result-summary">{{ view.summary }}</p>
    <div v-if="artifact.saved.length" class="approval-actions">
      <button
        class="approval-button primary icon-label"
        type="button"
        @click="$emit('generateGeneral')"
      >
        <Sparkles :size="15" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t('生成通用简历') }}</span>
        <ArrowRight :size="15" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <button
        class="approval-button icon-label"
        type="button"
        @click="$emit('open', artifact)"
      >
        <span>{{ $t('查看并补充经历') }}</span>
      </button>
    </div>
  </section>
</template>
