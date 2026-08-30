<script setup lang="ts">
import { Bot, Hand, Pause, Play, Square } from "@lucide/vue";

import type { BrowserAgentControlState } from "@desktop/types";

defineProps<{ state: BrowserAgentControlState }>();
defineEmits<{ pause: []; resume: []; takeover: []; stop: [] }>();
</script>

<template>
  <section class="agent-bar no-drag" :aria-label="$t('Agent 浏览器控制')">
    <span class="agent-mark" aria-hidden="true"><Bot :size="15" :stroke-width="1.8" /></span>
    <div class="agent-copy">
      <strong>{{ state.control === 'agent' ? $t('Agent 控制中') : $t('你正在控制') }}</strong>
      <span>{{ state.message }} · {{ state.goal }}</span>
    </div>
    <div class="agent-actions">
      <button v-if="state.control === 'user' || state.status === 'paused'" type="button" @click="$emit('resume')">
        <Play :size="14" aria-hidden="true" />{{ $t('交还 Agent') }}
      </button>
      <template v-else>
        <button type="button" @click="$emit('pause')"><Pause :size="14" aria-hidden="true" />{{ $t('暂停') }}</button>
        <button type="button" @click="$emit('takeover')"><Hand :size="14" aria-hidden="true" />{{ $t('我来操作') }}</button>
      </template>
      <button type="button" class="stop-action" @click="$emit('stop')"><Square :size="13" aria-hidden="true" />{{ $t('停止') }}</button>
    </div>
  </section>
</template>

<style scoped>
.agent-bar { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 9px; align-items: center;
  min-height: 38px; padding: 5px 10px; border-top: 1px solid var(--border); background: var(--surface); }
.agent-mark { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: var(--surface-strong); }
.agent-copy { min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.agent-copy strong { flex: none; font-size: 12px; } .agent-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
.agent-actions { display: flex; gap: 5px; }
.agent-actions button { display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 7px; padding: 5px 8px;
  background: transparent; color: var(--text-soft); font-size: 11px; cursor: pointer; }
.agent-actions button:hover, .agent-actions button:focus-visible { background: var(--surface-hover); color: var(--text); }
.agent-actions .stop-action { color: var(--danger); }
@media (max-width: 760px) { .agent-copy span { display: none; } .agent-actions button { padding: 5px; } }
</style>
