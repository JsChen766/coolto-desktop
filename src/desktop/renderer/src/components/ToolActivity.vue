<script setup lang="ts">
import {
  Check,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Wrench,
} from "@lucide/vue";
import { computed, ref } from "vue";
import type { ToolRun } from "../chat/tool-run-state";

const props = defineProps<{
  runs: ToolRun[];
}>();

const expanded = ref(false);
const hasError = computed(() =>
  props.runs.some((run) => run.status === "error"),
);
const progressLabel = computed(() =>
  [...props.runs].reverse().find((run) => Boolean(run.progressLabel))
    ?.progressLabel,
);
</script>

<template>
  <div
    v-if="runs.length"
    class="tool-activity"
    :class="{ expanded }"
    data-testid="tool-activity"
  >
    <p
      v-if="progressLabel"
      class="tool-progress"
      data-testid="resume-generation-progress"
      aria-live="polite"
    >
      {{ progressLabel }}
    </p>
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
    <div v-show="expanded" class="tool-list">
      <div
        v-for="run in runs"
        :key="run.callId"
        class="tool-row"
        data-testid="tool-run"
        :data-tool-call-id="run.callId"
        :data-tool-name="run.name"
        :data-tool-status="run.status"
        :data-tool-error="run.error"
      >
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
        <span class="tool-copy">
          <code v-if="!run.label">{{ run.name }}</code>
          <span v-else class="tool-label">{{ run.label }}</span>
          <small v-if="run.error" class="tool-error" data-testid="tool-error">
            {{ run.error }}
          </small>
        </span>
      </div>
    </div>
  </div>
</template>
