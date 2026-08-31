<script setup lang="ts">
import {
  Bot, CircleAlert, CircleCheck, CircleX, Clock3, Hand, Pause, ShieldOff, Square,
} from "@lucide/vue";
import { computed, useTemplateRef, type Component } from "vue";

import type { BrowserAgentChromeView } from "@desktop/types";
import { translate, translateFormat } from "../i18n/locale";

const props = defineProps<{
  state: BrowserAgentChromeView;
  expanded: boolean;
}>();
const emit = defineEmits<{ toggle: [] }>();
const button = useTemplateRef<HTMLButtonElement>("button");
defineExpose({ focus: () => button.value?.focus() });

const presentation = computed((): {
  icon: Component;
  label: string;
  tone: "active" | "attention" | "success" | "danger" | "neutral";
} => {
  if (props.state.control === "user" || props.state.phase === "user_control") {
    return { icon: Hand, label: "你正在操作", tone: "active" };
  }
  switch (props.state.phase) {
    case "queued":
      return { icon: Clock3, label: "任务已排队", tone: "neutral" };
    case "planning":
      return { icon: Bot, label: "Agent 正在规划", tone: "active" };
    case "waiting":
    case "reviewing":
      return { icon: CircleAlert, label: "等待你处理", tone: "attention" };
    case "paused":
      return { icon: Pause, label: "任务已暂停", tone: "neutral" };
    case "revoked":
      return { icon: ShieldOff, label: "授权已撤销", tone: "danger" };
    case "expired":
      return { icon: ShieldOff, label: "授权已过期", tone: "danger" };
    case "failed":
      return { icon: CircleX, label: "任务失败", tone: "danger" };
    case "completed":
      return { icon: CircleCheck, label: "任务已完成", tone: "success" };
    case "partial":
      return { icon: CircleAlert, label: "任务部分完成", tone: "attention" };
    case "stopped":
      return { icon: Square, label: "任务已停止", tone: "neutral" };
    case "acting":
      return { icon: Bot, label: "Agent 操作中", tone: "active" };
    default:
      return { icon: Bot, label: "Agent 状态已更新", tone: "neutral" };
  }
});

const summaryCopy = computed(() => props.state.phase === "reviewing" && props.state.review
  ? translateFormat("本批共有 {count} 项页面修改", {
      count: props.state.review.total,
    })
  : translate(props.state.summary));
const tooltip = computed(() => [translate(presentation.value.label), summaryCopy.value]
  .filter(Boolean).join("："));
</script>

<template>
  <button
    ref="button"
    class="agent-capsule no-drag"
    :class="`tone-${presentation.tone}`"
    type="button"
    :aria-expanded="expanded"
    :aria-label="tooltip"
    :aria-busy="state.commandPending"
    :title="tooltip"
    @click="emit('toggle')"
  >
    <component :is="presentation.icon" class="capsule-icon"
      :size="15" :stroke-width="1.9" aria-hidden="true" />
    <span class="capsule-state">{{ $t(presentation.label) }}</span>
    <span v-if="state.summary" class="capsule-summary">{{ summaryCopy }}</span>
  </button>
</template>

<style scoped>
.agent-capsule {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 1 250px;
  min-width: 0;
  height: 30px;
  padding: 0 11px;
  border: 0;
  border-radius: 999px;
  background: var(--surface-strong);
  color: var(--text-soft);
  font: 12px/1 var(--font-ui);
  transition: background-color var(--motion-fast) var(--ease-out-quart),
    color var(--motion-fast) var(--ease-out-quart),
    transform var(--motion-instant) var(--ease-out-quart);
}

.agent-capsule:hover { background: var(--surface-hover); color: var(--text); }
.agent-capsule:active { transform: scale(.98); }
.agent-capsule:focus-visible { outline: 2px solid var(--browser-accent); outline-offset: 2px; }
.agent-capsule[aria-expanded="true"] { background: var(--browser-solid);
  color: var(--browser-on-solid); }
.capsule-icon, .capsule-state { flex: none; }
.capsule-state { font-weight: 600; }
.capsule-summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.capsule-icon { color: currentColor; }

@media (max-width: 760px) {
  .agent-capsule { flex-basis: auto; max-width: 118px; padding-inline: 9px; }
  .capsule-summary { display: none; }
}

@media (max-width: 480px) {
  .agent-capsule { max-width: 86px; }
  .capsule-state { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

@media (prefers-reduced-motion: reduce) {
  .agent-capsule { transition: none; }
}
</style>
