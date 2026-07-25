<template>
  <div class="checkpoint-panel">
    <div class="checkpoint-panel-header">
      <span>本地历史</span>
      <button class="checkpoint-close-btn" aria-label="关闭" @click="$emit('close')">✕</button>
    </div>

    <p class="checkpoint-note">
      恢复检查点会创建新的本地工作头，不删除后续检查点，也不写入云端。
    </p>

    <ul class="checkpoint-list" v-if="checkpoints.length">
      <li
        v-for="cp in sorted"
        :key="cp.id"
        class="checkpoint-item"
      >
        <div class="checkpoint-item-info">
          <span class="checkpoint-label">{{ cp.label }}</span>
          <span class="checkpoint-time">{{ formatDate(cp.createdAt) }}</span>
        </div>
        <button
          class="checkpoint-restore-btn"
          @click="$emit('restore', cp.id)"
        >
          恢复
        </button>
      </li>
    </ul>

    <p v-else class="checkpoint-empty">暂无本地检查点</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ResumeDraftCheckpoint } from "@desktop/types";

const props = defineProps<{
  checkpoints: ResumeDraftCheckpoint[];
}>();

defineEmits<{
  close: [];
  restore: [checkpointId: string];
}>();

const sorted = computed(() =>
  [...props.checkpoints].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
);

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>
