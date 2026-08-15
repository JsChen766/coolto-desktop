<script setup lang="ts">
import { FileText } from "@lucide/vue";
import type { ChatMessage } from "@desktop/types";

import MarkdownContent from "./MarkdownContent.vue";
import { attachmentStatus, fileSize } from "../attachments/attachment-formatters";

defineProps<{
  message: ChatMessage;
}>();
</script>

<template>
  <article class="chat-message" :class="`role-${message.role}`">
    <div v-if="message.role === 'user'" class="user-bubble">
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
          <FileText :size="15" :stroke-width="1.8" aria-hidden="true" />
          <span class="message-attachment-copy">
            <span class="message-attachment-name">{{ attachment.filename }}</span>
            <small>
              {{ fileSize(attachment.sizeBytes) }} ·
              {{ attachmentStatus(attachment) }}
            </small>
          </span>
        </div>
      </div>
      {{ message.content }}
    </div>
    <MarkdownContent v-else :content="message.content" />
  </article>
</template>
