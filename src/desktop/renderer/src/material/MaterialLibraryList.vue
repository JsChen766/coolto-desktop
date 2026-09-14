<script setup lang="ts">
import type { MaterialView } from "@desktop/types/material";

defineProps<{
  materials: readonly MaterialView[];
  selectedId?: string | undefined;
}>();
defineEmits<{ select: [materialId: string] }>();

function statusLabel(status: MaterialView["status"]): string {
  return {
    unclassified: "未归类",
    queued: "等待 OCR",
    processing: "处理中",
    needs_confirmation: "待确认",
    ready: "已整理",
    failed: "处理失败",
    expired: "OCR 已过期",
  }[status];
}
</script>

<template>
  <div class="material-list-pane" :aria-label="$t('材料列表')">
    <button
      v-for="material in materials"
      :key="material.materialId"
      class="material-row"
      :class="{ active: selectedId === material.materialId }"
      type="button"
      @click="$emit('select', material.materialId)"
    >
      <span class="material-row-main">
        <strong>{{ material.title }}</strong>
        <small>{{ material.originalFilename || material.mediaKind }}</small>
      </span>
      <span class="material-row-side">
        <span class="material-status">{{ statusLabel(material.status) }}</span>
        <small>{{ material.citationCount }} {{ $t('引用') }}</small>
      </span>
    </button>
  </div>
</template>
