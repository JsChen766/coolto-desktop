<script setup lang="ts">
import { FileText, X } from "@lucide/vue";

import IconButton from "./IconButton.vue";

defineEmits<{
  close: [];
}>();
</script>

<template>
  <aside class="artifact-panel">
    <header class="artifact-header">
      <div class="artifact-title icon-label">
        <FileText :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>简历预览</span>
      </div>
      <IconButton :icon="X" label="关闭预览" @click="$emit('close')" />
    </header>
    <div class="artifact-canvas">
      <div class="paper-preview">
        <div class="paper-placeholder">
          <FileText :size="24" :stroke-width="1.4" aria-hidden="true" />
          <strong>还没有简历草稿</strong>
          <span>生成简历后将在这里实时预览和测量。</span>
        </div>
      </div>
    </div>
  </aside>
</template>
