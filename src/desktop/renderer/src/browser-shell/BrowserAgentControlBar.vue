<script setup lang="ts">
import { ExternalLink, Hand, Pause, Play, Square, X } from "@lucide/vue";
import { nextTick, shallowRef, useTemplateRef } from "vue";

import type { BrowserAgentChromeView } from "@desktop/types";

const props = defineProps<{ state: BrowserAgentChromeView }>();
const emit = defineEmits<{
  command: [action: "pause" | "resume" | "takeover" | "stop"];
  openTask: [];
}>();
const confirmingStop = shallowRef(false);
const cancelStop = useTemplateRef<HTMLButtonElement>("cancelStop");
const openTask = useTemplateRef<HTMLButtonElement>("openTask");
const stopTrigger = useTemplateRef<HTMLButtonElement>("stopTrigger");

async function requestStop(): Promise<void> {
  confirmingStop.value = true;
  await nextTick();
  cancelStop.value?.focus();
}

async function confirmStop(): Promise<void> {
  confirmingStop.value = false;
  emit("command", "stop");
  await nextTick();
  openTask.value?.focus();
}

async function cancelStopConfirmation(): Promise<void> {
  confirmingStop.value = false;
  await nextTick();
  stopTrigger.value?.focus();
}
</script>

<template>
  <footer class="control-bar" :aria-busy="state.commandPending">
    <p v-if="state.commandError" class="command-error" role="alert">
      {{ $t(state.commandError) }}
    </p>
    <div v-if="confirmingStop" class="stop-confirm" role="alert">
      <div>
        <strong>{{ $t('停止任务？') }}</strong>
        <span>{{ $t('任务将停止运行，已有授权仍可在完整任务中管理。') }}</span>
      </div>
      <button ref="cancelStop" type="button" @click="cancelStopConfirmation">
        <X :size="14" aria-hidden="true" />{{ $t('取消停止') }}
      </button>
      <button type="button" class="danger" @click="confirmStop">
        <Square :size="13" aria-hidden="true" />{{ $t('停止任务') }}
      </button>
    </div>
    <template v-else>
      <div class="primary-controls">
        <button v-if="state.commands.resume" type="button" class="primary"
          :disabled="state.commandPending" @click="emit('command', 'resume')">
          <Play :size="14" aria-hidden="true" />
          {{ $t(state.phase === 'user_control' ? '交还 Agent' : '继续任务') }}
        </button>
        <button v-if="state.commands.pause" type="button" :disabled="state.commandPending"
          @click="emit('command', 'pause')">
          <Pause :size="14" aria-hidden="true" />{{ $t('暂停任务') }}
        </button>
        <button v-if="state.commands.takeover" type="button" class="primary"
          :disabled="state.commandPending" @click="emit('command', 'takeover')">
          <Hand :size="14" aria-hidden="true" />{{ $t('我来操作') }}
        </button>
      </div>
      <div class="secondary-controls">
        <button ref="openTask" type="button" :disabled="state.commandPending"
          @click="emit('openTask')">
          <ExternalLink :size="14" aria-hidden="true" />{{ $t('打开完整任务') }}
        </button>
        <button v-if="state.commands.stop" ref="stopTrigger" type="button" class="stop"
          :disabled="state.commandPending" @click="requestStop">
          <Square :size="13" aria-hidden="true" />{{ $t('停止任务') }}
        </button>
      </div>
    </template>
  </footer>
</template>

<style scoped>
.control-bar { display: grid; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--border);
  background: var(--bg); }
.command-error { margin: 0; color: var(--danger); font-size: 12px; }
.primary-controls, .secondary-controls { display: flex; flex-wrap: wrap; gap: 6px; }
.secondary-controls { justify-content: space-between; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 30px; padding: 0 9px; border: 0; border-radius: 7px; background: var(--surface);
  color: var(--text-soft); font: 12px/1 var(--font-ui); }
button:hover:not(:disabled) { background: var(--surface-strong); color: var(--text); }
button:focus-visible { outline: 2px solid var(--browser-accent); outline-offset: 1px; }
button:disabled { opacity: 0.5; }
button.primary { background: var(--text); color: var(--bg); }
button.stop, button.danger { color: var(--danger); }
.stop-confirm { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 7px;
  align-items: center; }
.stop-confirm div { display: grid; gap: 3px; min-width: 0; }
.stop-confirm strong { font-size: 12px; }
.stop-confirm span { color: var(--muted); font-size: 12px; line-height: 1.35; }

@media (max-width: 360px) {
  .stop-confirm { grid-template-columns: 1fr 1fr; }
  .stop-confirm div { grid-column: 1 / -1; }
}
</style>
