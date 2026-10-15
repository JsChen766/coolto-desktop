<script setup lang="ts">
import type { Component } from "vue";
import { motion } from "motion-v";

import {
  prefersReducedMotion,
  segmentViewTween,
} from "../motion/segment-view-motion";

export interface SegmentPillItem {
  key: string;
  label: string;
  icon: Component;
}

defineProps<{
  modelValue: string;
  items: readonly SegmentPillItem[];
  layoutId: string;
}>();
defineEmits<{ "update:modelValue": [value: string] }>();

const reduced = prefersReducedMotion();
const pillTween = reduced ? { duration: 0 } : segmentViewTween;
</script>

<template>
  <nav class="tracker-view-switcher has-pill">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      :class="{ active: modelValue === item.key }"
      :aria-pressed="modelValue === item.key"
      @click="$emit('update:modelValue', item.key)"
    >
      <motion.span
        v-if="modelValue === item.key"
        class="tracker-view-pill"
        layout
        :layout-id="layoutId"
        :transition="pillTween"
      />
      <component :is="item.icon" :size="14" aria-hidden="true" />
      {{ $t(item.label) }}
    </button>
  </nav>
</template>
