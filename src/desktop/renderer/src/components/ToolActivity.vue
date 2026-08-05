<script setup lang="ts">
import {
  Check,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Wrench,
} from "@lucide/vue";
import { computed, ref } from "vue";

export interface ToolRun {
  callId: string;
  name: string;
  label?: string;
  status: "running" | "completed" | "error";
}

const props = defineProps<{
  runs: ToolRun[];
}>();

const expanded = ref(false);
const hasError = computed(() =>
  props.runs.some((run) => run.status === "error"),
);
</script>

<template>
  <div v-if="runs.length" class="tool-activity" :class="{ expanded }">
    <button
      class="tool-activity-header icon-label"
      type="button"
      @click="expanded = !expanded"
    >
      <ChevronRight
        class="tool-chevron"
        :size="15"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <Wrench :size="14" :stroke-width="1.8" aria-hidden="true" />
      <span>
        {{ hasError ? $t('工具调用出现问题') : $tf('工具调用 {count} 项', { count: runs.length }) }}
      </span>
    </button>
    <div v-if="expanded" class="tool-list">
      <div v-for="run in runs" :key="run.callId" class="tool-row">
        <LoaderCircle
          v-if="run.status === 'running'"
          class="spin"
          :size="14"
          :stroke-width="1.8"
          aria-hidden="true"
        />
        <Check
          v-else-if="run.status === 'completed'"
          :size="14"
          :stroke-width="1.8"
          aria-hidden="true"
        />
        <CircleAlert
          v-else
          :size="14"
          :stroke-width="1.8"
          aria-hidden="true"
        />
        <code v-if="!run.label">{{ run.name }}</code>
        <span v-else class="tool-label">{{ run.label }}</span>
      </div>
    </div>
  </div>
</template>
