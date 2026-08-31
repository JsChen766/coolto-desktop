import { computed, onBeforeUnmount, onMounted, shallowReadonly, shallowRef } from "vue";

import type { AgentTaskDetailView, AgentTaskView, DesktopApi } from "@desktop/types";
import { openPresentedBrowser } from "../browser/open-presented-browser";

type TaskAction = "start" | "resume" | "pause" | "cancel" | "revoke";

export function useAgentTasks(
  api: DesktopApi,
  initialTaskId: () => string | undefined = () => undefined,
) {
  const tasks = shallowRef<AgentTaskView[]>([]);
  const detail = shallowRef<AgentTaskDetailView>();
  const selectedId = shallowRef<string>();
  const loading = shallowRef(false);
  const busy = shallowRef<TaskAction>();
  const error = shallowRef<string>();
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  const selected = computed(() => detail.value?.task);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = undefined;
    try {
      tasks.value = await api.agentTasks.list();
      const target = initialTaskId() ?? selectedId.value ?? tasks.value[0]?.id;
      if (target) await select(target);
      else detail.value = undefined;
    } catch (cause) {
      error.value = message(cause, "读取 Agent 任务失败");
    } finally {
      loading.value = false;
    }
  }

  async function select(taskId: string): Promise<void> {
    selectedId.value = taskId;
    try {
      detail.value = await api.agentTasks.get(taskId);
    } catch (cause) {
      error.value = message(cause, "读取 Agent 任务详情失败");
    }
  }

  async function act(action: TaskAction): Promise<void> {
    const taskId = selectedId.value;
    if (!taskId || busy.value) return;
    busy.value = action;
    error.value = undefined;
    try {
      const operation = api.agentTasks[action](taskId);
      if (action === "start" || action === "resume") {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await select(taskId);
      }
      detail.value = await operation;
      tasks.value = await api.agentTasks.list();
    } catch (cause) {
      error.value = message(cause, `Agent 任务${action}失败`);
      await select(taskId);
    } finally {
      busy.value = undefined;
    }
  }

  async function openBrowser(url?: string): Promise<void> {
    await openPresentedBrowser(api, url ? { url } : {});
  }

  onMounted(() => {
    void load();
    refreshTimer = setInterval(() => {
      if (detail.value?.task.status === "running") void select(detail.value.task.id);
    }, 1_000);
  });
  onBeforeUnmount(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  return {
    tasks: shallowReadonly(tasks), detail: shallowReadonly(detail),
    selectedId: shallowReadonly(selectedId), selected,
    loading: shallowReadonly(loading), busy: shallowReadonly(busy),
    error: shallowReadonly(error),
    load, select, act, openBrowser,
  };
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
