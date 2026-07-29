<script setup lang="ts">
import { FilePlus2, FileText, X } from "@lucide/vue";

import type { ResumeChatReference } from "@desktop/types";

const props = defineProps<{
  reference: ResumeChatReference;
  context?: boolean;
  copyRequested?: boolean;
}>();
defineEmits<{ clear: []; createLocalCopy: [] }>();

function contextLabel(): string {
  if (!props.context) return "简历引用";
  if (props.reference.source !== "cloud") return "正在操作 · 本地工作稿";
  return props.copyRequested
    ? "正在操作 · 本地副本待创建"
    : "正在操作 · 云端只读";
}
</script>

<template>
  <div class="composer-resume-reference">
    <FileText :size="14" :stroke-width="1.8" aria-hidden="true" />
    <span>
      <small>{{ contextLabel() }}</small>
      <strong>{{ reference.label }}</strong>
    </span>
    <button
      v-if="context && reference.source === 'cloud' && !copyRequested"
      class="resume-context-copy"
      type="button"
      @click="$emit('createLocalCopy')"
    >
      <FilePlus2 :size="13" :stroke-width="1.8" aria-hidden="true" />
      创建本地工作副本
    </button>
    <button
      type="button"
      aria-label="移除简历上下文"
      title="移除简历上下文"
      @click="$emit('clear')"
    >
      <X :size="14" :stroke-width="1.8" aria-hidden="true" />
    </button>
  </div>
</template>
