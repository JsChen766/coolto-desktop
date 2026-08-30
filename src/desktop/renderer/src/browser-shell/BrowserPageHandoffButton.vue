<script setup lang="ts">
import { MessageSquare } from "@lucide/vue";

defineEmits<{ open: [] }>();
</script>

<template>
  <button class="handoff-button" type="button"
    :aria-label="$t('在 App 中使用此页面')" :title="$t('在 App 中使用此页面')"
    @click="$emit('open')">
    <MessageSquare :size="17" :stroke-width="1.8" aria-hidden="true" />
  </button>
</template>

<style scoped>
.handoff-button { display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: 0; border-radius: 7px; background: transparent;
  color: var(--text-soft); cursor: pointer; }
.handoff-button:hover, .handoff-button:focus-visible { background: var(--surface-hover); }
.handoff-button:focus-visible { outline: 2px solid var(--selection-bg); outline-offset: 1px; }
</style>
