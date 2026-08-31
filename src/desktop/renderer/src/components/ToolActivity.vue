<script setup lang="ts">
import {
  Check,
  CircleAlert,
  LoaderCircle,
} from "@lucide/vue";
import { computed } from "vue";
import type { ToolRun } from "../chat/tool-run-state";

const props = defineProps<{
  runs: ToolRun[];
}>();

const hasError = computed(() =>
  props.runs.some((run) => run.status === "error"),
);
const running = computed(() =>
  props.runs.some((run) => run.status === "running"),
);
const progressLabel = computed(() =>
  [...props.runs].reverse().find((run) => Boolean(run.progressLabel))
    ?.progressLabel,
);
const statusLabel = computed(() => {
  if (hasError.value && !running.value) return "部分步骤未完成，请查看提示";
  if (progressLabel.value) return progressLabel.value;
  if (running.value) return "正在处理";
  return "正在整理结果";
});
</script>

<template>
  <div
    v-if="runs.length"
    class="tool-activity"
    data-testid="tool-activity"
    :data-tool-error="hasError || undefined"
    role="status"
    aria-live="polite"
  >
    <p
      class="tool-activity-summary tool-progress"
      data-testid="resume-generation-progress"
    >
      <LoaderCircle
        v-if="running"
        class="spin"
        :size="14"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <CircleAlert
        v-else-if="hasError"
        :size="14"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <Check
        v-else
        :size="14"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <span>{{ statusLabel }}</span>
    </p>
  </div>
</template>
