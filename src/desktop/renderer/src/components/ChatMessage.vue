<script setup lang="ts">
import { Check, Copy, FileText } from "@lucide/vue";
import { computed, ref } from "vue";
import type { ChatMessage } from "@desktop/types";

import MarkdownContent from "./MarkdownContent.vue";
import { fileSize } from "../attachments/attachment-formatters";

const props = defineProps<{
  message: ChatMessage;
}>();

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;

const completedTime = computed(() => {
  if (!props.message.completedAt) return "";
  return new Date(props.message.completedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
});

async function copyContent(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.message.content);
  } catch {
    return;
  }
  copied.value = true;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, 1600);
}
</script>

<template>
  <article class="chat-message" :class="`role-${message.role}`">
    <div v-if="message.role === 'user'" class="user-message">
      <div
        v-if="message.attachments && message.attachments.length > 0"
        class="message-attachments"
      >
        <div
          v-for="attachment in message.attachments"
          :key="attachment.fileId"
          class="message-attachment"
          :class="`attachment-status-${attachment.status}`"
        >
          <FileText :size="12" :stroke-width="1.8" aria-hidden="true" />
          <span class="message-attachment-name">{{ attachment.filename }}</span>
          <small>{{ fileSize(attachment.sizeBytes) }}</small>
        </div>
      </div>
      <div class="user-bubble">{{ message.content }}</div>
    </div>
    <template v-else>
      <MarkdownContent :content="message.content" />
      <div v-if="message.completedAt" class="message-meta">
        <button
          type="button"
          class="copy-button"
          :title="$t('复制回答')"
          :aria-label="$t('复制回答')"
          @click="copyContent"
        >
          <Check v-if="copied" :size="12" :stroke-width="2" aria-hidden="true" />
          <Copy v-else :size="12" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <span class="message-completed-at">
          {{ $t('结束于') }} {{ completedTime }}
        </span>
      </div>
    </template>
  </article>
</template>
