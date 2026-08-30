<script setup lang="ts">
import {
  Bot, CircleAlert, CircleCheck, CircleX, Clock3, Hand, Pause, ShieldOff, Square, X,
} from "@lucide/vue";
import { computed, nextTick, useTemplateRef, type Component } from "vue";

import type { BrowserAgentChromeView } from "@desktop/types";
import { translate, translateFormat } from "../i18n/locale";
import BrowserAgentActivityPreview from "./BrowserAgentActivityPreview.vue";
import BrowserAgentControlBar from "./BrowserAgentControlBar.vue";
import BrowserAgentGrantSummary from "./BrowserAgentGrantSummary.vue";
import BrowserAgentTaskSummary from "./BrowserAgentTaskSummary.vue";

const props = defineProps<{
  state: BrowserAgentChromeView;
  mode: "docked" | "overlay";
  presentation: "open" | "closing";
}>();
const emit = defineEmits<{
  close: [];
  command: [action: "pause" | "resume" | "takeover" | "stop"];
  openTask: [];
}>();
const heading = useTemplateRef<HTMLElement>("heading");

const presentation = computed((): {
  icon: Component;
  label: string;
  tone: "active" | "attention" | "success" | "danger" | "neutral";
} => {
  if (props.state.control === "user" || props.state.phase === "user_control") {
    return { icon: Hand, label: "你正在操作", tone: "active" };
  }
  switch (props.state.phase) {
    case "queued": return { icon: Clock3, label: "任务已排队", tone: "neutral" };
    case "planning": return { icon: Bot, label: "Agent 正在规划", tone: "active" };
    case "waiting":
    case "reviewing": return { icon: CircleAlert, label: "等待你处理", tone: "attention" };
    case "paused": return { icon: Pause, label: "任务已暂停", tone: "neutral" };
    case "revoked": return { icon: ShieldOff, label: "授权已撤销", tone: "danger" };
    case "expired": return { icon: ShieldOff, label: "授权已过期", tone: "danger" };
    case "failed": return { icon: CircleX, label: "任务失败", tone: "danger" };
    case "completed": return { icon: CircleCheck, label: "任务已完成", tone: "success" };
    case "partial": return { icon: CircleAlert, label: "任务部分完成", tone: "attention" };
    case "stopped": return { icon: Square, label: "任务已停止", tone: "neutral" };
    case "acting": return { icon: Bot, label: "Agent 操作中", tone: "active" };
    default: return { icon: Bot, label: "Agent 状态已更新", tone: "neutral" };
  }
});
const summaryCopy = computed(() => props.state.phase === "reviewing" && props.state.review
  ? translateFormat("本批共有 {count} 项页面修改", {
      count: props.state.review.total,
    })
  : translate(props.state.summary));

async function focusInitial(): Promise<void> {
  await nextTick();
  heading.value?.focus();
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  emit("close");
}

defineExpose({ focusInitial });
</script>

<template>
  <aside
    id="browser-agent-inspector"
    class="agent-inspector no-drag"
    :class="[
      `mode-${mode}`, `tone-${presentation.tone}`,
      `presentation-${props.presentation}`,
    ]"
    role="complementary"
    aria-labelledby="browser-agent-inspector-heading"
    :aria-busy="state.commandPending"
    @keydown="handleEscape"
  >
    <header class="inspector-header">
      <span class="status-icon" aria-hidden="true">
        <component :is="presentation.icon" :size="16" :stroke-width="1.9" />
      </span>
      <div>
        <span class="status-label">{{ $t(presentation.label) }}</span>
        <h2 id="browser-agent-inspector-heading" ref="heading" tabindex="-1">
          {{ state.goal }}
        </h2>
      </div>
      <button class="close-inspector" type="button"
        :aria-label="$t('关闭任务详情')" :title="$t('关闭任务详情')"
        @click="emit('close')">
        <X :size="17" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </header>

    <p class="live-status" aria-live="polite" aria-atomic="true">
      {{ $t(presentation.label) }}。{{ summaryCopy }}
    </p>

    <div class="inspector-content">
      <BrowserAgentTaskSummary :state="state" />
      <BrowserAgentGrantSummary
        :delegation="state.delegation"
        :target-origin="state.targetOrigin"
      />
      <BrowserAgentActivityPreview :items="state.recentActivity" />
    </div>

    <BrowserAgentControlBar
      :state="state"
      @command="emit('command', $event)"
      @open-task="emit('openTask')"
    />
  </aside>
</template>

<style scoped>
.agent-inspector {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font: 13px/1.4 var(--font-ui);
}

.mode-docked { border-left: 1px solid var(--border); }
.mode-overlay { box-shadow: var(--shadow-menu); }
.inspector-header { display: grid; grid-template-columns: 28px minmax(0, 1fr) 30px;
  gap: 8px; align-items: start; padding: 14px; border-bottom: 1px solid var(--border); }
.status-icon { display: grid; place-items: center; width: 28px; height: 28px;
  border-radius: 8px; background: var(--surface); color: var(--muted); }
.tone-active .status-icon { color: var(--browser-accent); }
.tone-attention .status-icon { color: var(--browser-attention); }
.tone-success .status-icon { color: var(--browser-success); }
.tone-danger .status-icon { color: var(--danger); }
.status-label { color: var(--text-soft); font-size: 12px; font-weight: 600; }
h2 { margin: 3px 0 0; overflow-wrap: anywhere; font-size: 15px; line-height: 1.35;
  font-weight: 600; }
h2:focus-visible { outline: 2px solid var(--browser-accent); outline-offset: 2px; }
.close-inspector { display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px;
  background: transparent; color: var(--text-soft); }
.close-inspector:hover { background: var(--surface-hover); color: var(--text); }
.close-inspector:focus-visible { outline: 2px solid var(--browser-accent); outline-offset: 1px; }
.inspector-content { min-height: 0; overflow: auto; padding: 16px 14px 24px; }
.live-status { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.presentation-closing { pointer-events: none; }

@media (prefers-reduced-motion: no-preference) {
  .presentation-open { animation: inspector-enter 200ms cubic-bezier(.16, 1, .3, 1)
    both; }
  .presentation-closing { animation: inspector-exit 160ms cubic-bezier(.4, 0, 1, 1)
    both; }
}

@keyframes inspector-enter {
  from { opacity: 0; transform: translateX(12px); }
}
@keyframes inspector-exit {
  to { opacity: 0; transform: translateX(8px); }
}
</style>
