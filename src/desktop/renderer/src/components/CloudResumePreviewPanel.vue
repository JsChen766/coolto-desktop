<script setup lang="ts">
import { ArrowLeft, FileText, LoaderCircle } from "@lucide/vue";

import type { CloudResumePreview } from "@desktop/types";
import A4ResumePreview from "./A4ResumePreview.vue";

defineProps<{
  preview?: CloudResumePreview | undefined;
  busy?: boolean;
  error?: string | undefined;
}>();
defineEmits<{ back: [] }>();
</script>

<template>
  <aside class="artifact-panel">
    <header class="artifact-header">
      <div class="artifact-title-wrap">
        <button
          class="artifact-back-button icon-label"
          type="button"
          @click="$emit('back')"
        >
          <ArrowLeft :size="15" :stroke-width="1.8" aria-hidden="true" />
          {{ $t('返回求职仓库') }}
        </button>
        <div class="artifact-title icon-label">
          <FileText :size="16" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ preview?.title ?? $t('简历预览') }}</span>
        </div>
        <span v-if="preview" class="artifact-local-state">{{ $t('云端只读预览') }}</span>
      </div>
    </header>

    <div v-if="error" class="artifact-error">{{ error }}</div>
    <div v-if="busy && !preview" class="artifact-loading">
      <LoaderCircle class="spin" :size="20" :stroke-width="1.8" />
      <span>{{ $t('正在读取云端简历…') }}</span>
    </div>
    <A4ResumePreview v-else-if="preview" :structure="preview.structure" />
  </aside>
</template>
