<script setup lang="ts">
import { CalendarDays, ChartGantt, LayoutGrid } from "@lucide/vue";

import type { TrackerViewMode } from "../tracker/application-board";

defineProps<{ modelValue: TrackerViewMode }>();
defineEmits<{ "update:modelValue": [value: TrackerViewMode] }>();

const views = [
  { key: "board", label: "看板", icon: LayoutGrid },
  { key: "timeline", label: "时间轴", icon: ChartGantt },
  { key: "calendar", label: "日历", icon: CalendarDays },
] as const;
</script>

<template>
  <nav class="tracker-view-switcher" aria-label="投递追踪视图">
    <button
      v-for="view in views"
      :key="view.key"
      type="button"
      :class="{ active: modelValue === view.key }"
      :aria-pressed="modelValue === view.key"
      @click="$emit('update:modelValue', view.key)"
    >
      <component :is="view.icon" :size="14" aria-hidden="true" />
      {{ view.label }}
    </button>
  </nav>
</template>
