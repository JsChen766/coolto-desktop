<script setup lang="ts">
import { CalendarDays, ChartGantt, LayoutGrid } from "@lucide/vue";

import type { TrackerViewMode } from "../tracker/application-board";
import SegmentPillNav from "./SegmentPillNav.vue";

defineProps<{ modelValue: TrackerViewMode }>();
defineEmits<{ "update:modelValue": [value: TrackerViewMode] }>();

const items = [
  { key: "board", label: "看板", icon: LayoutGrid },
  { key: "timeline", label: "时间轴", icon: ChartGantt },
  { key: "calendar", label: "日历", icon: CalendarDays },
] as const;
</script>

<template>
  <SegmentPillNav
    :model-value="modelValue"
    :items="items"
    layout-id="tracker-view-pill"
    :aria-label="$t('投递追踪视图')"
    @update:model-value="$emit('update:modelValue', $event as TrackerViewMode)"
  />
</template>
