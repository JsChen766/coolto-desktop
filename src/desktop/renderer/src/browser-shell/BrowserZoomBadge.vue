<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ factor: number }>();
const emit = defineEmits<{ reset: [] }>();
const percentage = computed(() => Math.round(props.factor * 100));
const visible = computed(() => Number.isFinite(percentage.value)
  && percentage.value !== 100);
</script>

<template>
  <button
    v-if="visible"
    class="zoom-badge no-drag"
    type="button"
    :aria-label="$tf('当前缩放 {percent}%，恢复至 100%', { percent: percentage })"
    :title="$tf('当前缩放 {percent}%，恢复至 100%', { percent: percentage })"
    @click="emit('reset')"
  >
    {{ percentage }}%
  </button>
</template>

<style scoped>
.zoom-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 42px;
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-soft);
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  transition: background-color 140ms ease-out, color 140ms ease-out;
}

.zoom-badge:hover { background: var(--surface-strong); color: var(--text); }
.zoom-badge:focus-visible { outline: 2px solid var(--browser-accent); outline-offset: 1px; }

@media (prefers-reduced-motion: reduce) {
  .zoom-badge { transition: none; }
}
</style>
