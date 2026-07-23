<script setup lang="ts">
import type { ChatMessage } from "@desktop/types";

import MarkdownContent from "./MarkdownContent.vue";

defineProps<{
  message: ChatMessage;
}>();
</script>

<template>
  <article class="chat-message" :class="`role-${message.role}`">
    <div v-if="message.role === 'user'" class="user-bubble">
      {{ message.content }}
    </div>
    <MarkdownContent v-else :content="message.content" />
  </article>
</template>
