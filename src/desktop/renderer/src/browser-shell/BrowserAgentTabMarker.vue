<script setup lang="ts">
import { Bot, CircleAlert, Hand } from "@lucide/vue";
import { computed } from "vue";

import type { BrowserAgentChromeView } from "@desktop/types";

const props = defineProps<{ state: BrowserAgentChromeView }>();
const attention = computed(() => ["waiting", "reviewing", "partial"]
  .includes(props.state.phase));
const userControl = computed(() => props.state.control === "user");
const label = computed(() => {
  if (userControl.value) return "你正在操作此标签";
  if (attention.value) return "Agent 正在此标签等待你处理";
  if (props.state.phase === "paused") return "Agent 已在此标签暂停";
  if (["revoked", "expired", "completed", "failed", "stopped"]
    .includes(props.state.phase)) {
    return "任务最近在此标签结束";
  }
  return "Agent 正在此标签工作";
});
</script>

<template>
  <span class="agent-tab-marker"
    :class="{ attention, 'user-control': userControl }"
    role="img" :aria-label="$t(label)" :title="$t(label)">
    <Hand v-if="userControl" :size="12" :stroke-width="2" aria-hidden="true" />
    <CircleAlert v-else-if="attention" :size="12" :stroke-width="2" aria-hidden="true" />
    <Bot v-else :size="12" :stroke-width="2" aria-hidden="true" />
    <span class="marker-label">{{ userControl ? $t('你') : $t('Agent') }}</span>
  </span>
</template>

<style scoped>
.agent-tab-marker {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  color: var(--browser-accent);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.agent-tab-marker.attention { color: var(--browser-attention); }
.agent-tab-marker.user-control { color: var(--text-soft); }

@container (max-width: 110px) {
  .marker-label { display: none; }
}
</style>
