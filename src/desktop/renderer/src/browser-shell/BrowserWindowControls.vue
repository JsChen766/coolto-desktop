<script setup lang="ts">
import { Minus, Square, Copy, X } from "@lucide/vue";

defineProps<{
  isMaximized: boolean;
}>();

defineEmits<{
  minimize: [];
  toggleMaximize: [];
  close: [];
}>();
</script>

<template>
  <div class="window-controls no-drag">
    <button
      class="control-button"
      type="button"
      :aria-label="$t('最小化')"
      @click="$emit('minimize')"
    >
      <Minus :size="15" :stroke-width="1.8" aria-hidden="true" />
    </button>
    <button
      class="control-button"
      type="button"
      :aria-label="$t('最大化')"
      @click="$emit('toggleMaximize')"
    >
      <Copy v-if="isMaximized" :size="13" :stroke-width="1.8" aria-hidden="true" />
      <Square v-else :size="12" :stroke-width="1.8" aria-hidden="true" />
    </button>
    <button
      class="control-button close"
      type="button"
      :aria-label="$t('关闭')"
      @click="$emit('close')"
    >
      <X :size="16" :stroke-width="1.8" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  align-items: center;
}

.control-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--text-soft);
  cursor: default;
  transition: background-color var(--motion-fast) var(--ease-out-quart),
    color var(--motion-fast) var(--ease-out-quart);
}

.control-button:hover {
  background: var(--surface-hover);
}

.control-button.close:hover {
  background: var(--browser-solid);
  color: var(--browser-on-solid);
}

.control-button:focus-visible {
  outline: 2px solid var(--browser-accent);
  outline-offset: -3px;
}

@media (prefers-reduced-motion: reduce) {
  .control-button { transition: none; }
}
</style>
