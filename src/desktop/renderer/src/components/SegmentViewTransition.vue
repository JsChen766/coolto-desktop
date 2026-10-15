<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { ref, watch } from "vue";

import {
  prefersReducedMotion,
  segmentViewTween,
  viewSlideDirection,
  viewSlideVariants,
} from "../motion/segment-view-motion";

const props = defineProps<{
  viewKey: string;
  order: readonly string[];
  stageClass?: string;
}>();

const reduced = prefersReducedMotion();
const variants = viewSlideVariants(reduced);
const tween = reduced ? { duration: 0 } : segmentViewTween;
const direction = ref(0);
const previousKey = ref(props.viewKey);

watch(
  () => props.viewKey,
  (next) => {
    direction.value = viewSlideDirection(props.order, previousKey.value, next);
    previousKey.value = next;
  },
);
</script>

<template>
  <div class="segment-view-stage" :class="stageClass">
    <AnimatePresence mode="wait" :custom="direction" :initial="false">
      <motion.div
        :key="viewKey"
        class="segment-view-stage-pane"
        :custom="direction"
        :variants="variants"
        initial="enter"
        animate="center"
        exit="exit"
        :transition="tween"
      >
        <slot />
      </motion.div>
    </AnimatePresence>
  </div>
</template>
