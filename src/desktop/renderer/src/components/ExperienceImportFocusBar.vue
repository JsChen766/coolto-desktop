<script setup lang="ts">
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
} from "@lucide/vue";

defineProps<{
  count: number;
  position: number;
  missingCount: number;
  loading?: boolean;
}>();
defineEmits<{
  back: [];
  clear: [];
  move: [direction: -1 | 1];
}>();
</script>

<template>
  <div class="experience-import-focus-bar" aria-live="polite">
    <button class="icon-label" type="button" @click="$emit('back')">
      <ArrowLeft :size="15" :stroke-width="1.8" aria-hidden="true" />
      {{ $t('返回导入对话') }}
    </button>
    <span>
      <template v-if="loading">{{ $t('正在定位本次导入经历…') }}</template>
      <template v-else>
        {{ $tf('本次导入 {count} 条', { count }) }}
        <template v-if="count"> · {{ position }}/{{ count }}</template>
        <template v-if="missingCount"> · {{ $tf('{count} 条已不可用', { count: missingCount }) }}</template>
      </template>
    </span>
    <div class="experience-import-focus-actions">
      <button
        type="button"
        :aria-label="$t('上一条导入经历')"
        :title="$t('上一条导入经历')"
        :disabled="loading || count < 2"
        @click="$emit('move', -1)"
      >
        <ChevronLeft :size="16" aria-hidden="true" />
      </button>
      <button
        type="button"
        :aria-label="$t('下一条导入经历')"
        :title="$t('下一条导入经历')"
        :disabled="loading || count < 2"
        @click="$emit('move', 1)"
      >
        <ChevronRight :size="16" aria-hidden="true" />
      </button>
      <button class="icon-label" type="button" @click="$emit('clear')">
        <X :size="14" :stroke-width="1.8" aria-hidden="true" />
        {{ $t('结束定位') }}
      </button>
    </div>
  </div>
</template>
