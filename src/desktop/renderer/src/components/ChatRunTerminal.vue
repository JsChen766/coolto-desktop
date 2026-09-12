<script setup lang="ts">
import {
  CircleAlert,
  CircleCheck,
  CirclePause,
  MessageCircleQuestion,
  Square,
} from "@lucide/vue";
import type { ConversationRunTerminal } from "@desktop/types";

const props = defineProps<{ terminal: ConversationRunTerminal }>();
defineEmits<{
  continue: [];
  restart: [];
  openDraft: [artifactId: string];
}>();

function title(): string {
  if (props.terminal.status === "ready_for_approval") return "简历已就绪";
  if (props.terminal.status === "cancelled") return "任务已取消";
  if (props.terminal.status === "stopped") return "已停止追问";
  if (props.terminal.status === "needs_user_decision") return "等待你补充信息";
  return "任务未完成";
}
</script>

<template>
  <aside class="chat-run-terminal" :class="`is-${terminal.status}`" role="status">
    <CircleCheck
      v-if="terminal.status === 'ready_for_approval'"
      :size="17"
      aria-hidden="true"
    />
    <CirclePause v-else-if="terminal.status === 'cancelled'" :size="17" aria-hidden="true" />
    <Square v-else-if="terminal.status === 'stopped'" :size="17" aria-hidden="true" />
    <MessageCircleQuestion
      v-else-if="terminal.status === 'needs_user_decision'"
      :size="17"
      aria-hidden="true"
    />
    <CircleAlert v-else aria-hidden="true" :size="17" />
    <div>
      <strong>{{ $t(title()) }}</strong>
      <span>{{ $t(terminal.message ?? '最近一次任务未完成。') }}</span>
      <div class="chat-run-terminal-actions">
        <button
          v-if="terminal.artifactId"
          class="secondary-button"
          type="button"
          @click="$emit('openDraft', terminal.artifactId)"
        >
          {{ $t('打开已保留草稿') }}
        </button>
        <button
          v-if="terminal.canContinue && terminal.status !== 'needs_user_decision'"
          class="secondary-button"
          type="button"
          @click="$emit('continue')"
        >
          {{ $t('继续完成') }}
        </button>
        <button
          v-if="terminal.status === 'failed' || terminal.status === 'cancelled'"
          class="secondary-button"
          type="button"
          @click="$emit('restart')"
        >
          {{ $t('重新开始') }}
        </button>
      </div>
    </div>
  </aside>
</template>
