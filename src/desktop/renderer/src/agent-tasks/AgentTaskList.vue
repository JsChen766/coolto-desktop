<script setup lang="ts">
import { Bot, CircleAlert, CircleCheck, Pause, Play } from "@lucide/vue";

import type { AgentTaskView } from "@desktop/types";
import { taskStatusLabel } from "./agent-task-labels";

defineProps<{
  tasks: readonly AgentTaskView[];
  selectedId: string | undefined;
}>();
defineEmits<{ select: [taskId: string] }>();

function statusIcon(status: AgentTaskView["status"]) {
  if (status === "running") return Play;
  if (["completed", "partially_completed"].includes(status)) return CircleCheck;
  if (["failed", "canceled", "expired"].includes(status)) return CircleAlert;
  if (["paused", "waiting"].includes(status)) return Pause;
  return Bot;
}
</script>

<template>
  <div class="task-list" role="listbox" :aria-label="$t('Agent 任务列表')">
    <button
      v-for="task in tasks"
      :key="task.id"
      class="task-row"
      :class="{ active: task.id === selectedId }"
      type="button"
      role="option"
      :aria-selected="task.id === selectedId"
      @click="$emit('select', task.id)"
    >
      <component :is="statusIcon(task.status)" :size="15" :stroke-width="1.8" aria-hidden="true" />
      <span class="task-copy">
        <strong>{{ task.goal }}</strong>
        <small>{{ $t(taskStatusLabel(task.status)) }} · {{ new Date(task.updatedAt).toLocaleString() }}</small>
      </span>
    </button>
  </div>
</template>

<style scoped>
.task-list { display: grid; align-content: start; gap: 3px; padding: 8px; }
.task-row { width: 100%; display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 9px;
  align-items: start; padding: 10px; border: 0; border-radius: 9px; color: var(--text-soft);
  background: transparent; text-align: left; cursor: pointer; }
.task-row:hover, .task-row:focus-visible { background: var(--surface-hover); color: var(--text); }
.task-row.active { background: var(--surface-strong); color: var(--text); }
.task-copy { min-width: 0; display: grid; gap: 4px; }
.task-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.task-copy small { color: var(--muted); font-size: 11px; }
</style>
