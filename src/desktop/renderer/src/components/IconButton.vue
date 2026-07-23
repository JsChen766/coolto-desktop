<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  icon: Component;
  label: string;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}>();

defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<template>
  <button
    class="icon-button"
    :class="{ active }"
    type="button"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <component
      :is="icon"
      :size="size ?? 17"
      :stroke-width="1.8"
      aria-hidden="true"
    />
  </button>
</template>
