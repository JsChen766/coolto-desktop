<script setup lang="ts">
import { Bot, Menu, RefreshCw } from "@lucide/vue";
import { shallowRef, watch } from "vue";

import type { DesktopApi } from "@desktop/types";
import AgentTaskInspector from "./AgentTaskInspector.vue";
import AgentTaskList from "./AgentTaskList.vue";
import { useAgentTasks } from "./use-agent-tasks";

const props = defineProps<{
  api: DesktopApi;
  focusRequest?: { sequence: number; taskId: string } | undefined;
}>();
const emit = defineEmits<{
  toggleSidebar: [];
  openConversation: [conversationId: string];
}>();
const tasks = useAgentTasks(props.api, () => props.focusRequest?.taskId);
const mobileDetail = shallowRef(false);

async function selectTask(taskId: string): Promise<void> {
  await tasks.select(taskId);
  mobileDetail.value = true;
}

watch(() => props.focusRequest, (request) => {
  if (request) void selectTask(request.taskId);
});
</script>

<template>
  <section class="agent-tasks-view">
    <header class="tasks-header">
      <button class="icon-button sidebar-button" type="button" :aria-label="$t('打开侧栏')" @click="emit('toggleSidebar')">
        <Menu :size="18" aria-hidden="true" />
      </button>
      <div><h1>{{ $t('Agent 任务') }}</h1><p>{{ $t('本机任务 · 仅在 App 打开时运行') }}</p></div>
      <button class="icon-button" type="button" :aria-label="$t('刷新')" @click="tasks.load">
        <RefreshCw :size="17" aria-hidden="true" />
      </button>
    </header>

    <div v-if="tasks.loading.value && tasks.tasks.value.length === 0" class="tasks-empty">
      {{ $t('正在读取本机 Agent 任务…') }}
    </div>
    <div v-else-if="tasks.tasks.value.length === 0" class="tasks-empty">
      <Bot :size="24" :stroke-width="1.5" aria-hidden="true" />
      <h2>{{ $t('还没有托管任务') }}</h2>
      <p>{{ $t('回到对话，告诉 Agent 想寻找什么岗位和允许操作的网站。') }}</p>
    </div>
    <div v-else class="tasks-workspace" :class="{ 'show-mobile-detail': mobileDetail }">
      <aside class="tasks-list-pane">
        <AgentTaskList
          :tasks="tasks.tasks.value"
          :selected-id="tasks.selectedId.value"
          @select="selectTask"
        />
      </aside>
      <AgentTaskInspector
        v-if="tasks.detail.value"
        :detail="tasks.detail.value"
        :busy="tasks.busy.value"
        :error="tasks.error.value"
        @action="tasks.act"
        @open-browser="tasks.openBrowser"
        @open-lead="tasks.openBrowser($event)"
        @open-conversation="emit('openConversation', $event)"
        @back="mobileDetail = false"
      />
    </div>
  </section>
</template>

<style scoped>
.agent-tasks-view { height: 100%; min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--bg); }
.tasks-header { min-height: 66px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px;
  align-items: center; padding: 10px calc(18px + var(--window-controls-width, 0px)) 10px 18px; border-bottom: 1px solid var(--border); }
.tasks-header h1 { margin: 0; font-size: 16px; } .tasks-header p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
.icon-button { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px;
  background: transparent; color: var(--text-soft); cursor: pointer; }
.icon-button:hover, .icon-button:focus-visible { background: var(--surface-hover); color: var(--text); }
.sidebar-button { display: none; } .tasks-workspace { min-height: 0; display: grid; grid-template-columns: 300px minmax(0, 1fr); }
.tasks-list-pane { min-width: 0; overflow: auto; border-right: 1px solid var(--border); }
.tasks-empty { display: grid; place-items: center; align-content: center; gap: 8px; padding: 32px; text-align: center; color: var(--muted); }
.tasks-empty h2 { margin: 4px 0 0; color: var(--text); font-size: 17px; } .tasks-empty p { margin: 0; max-width: 420px; }
@media (max-width: 940px) { .sidebar-button { display: grid; } .tasks-workspace { grid-template-columns: 240px minmax(0, 1fr); } }
@media (max-width: 700px) { .tasks-workspace { grid-template-columns: 1fr; } .tasks-workspace:not(.show-mobile-detail) :deep(.task-inspector) { display: none; }
  .tasks-workspace.show-mobile-detail .tasks-list-pane { display: none; } }
</style>
