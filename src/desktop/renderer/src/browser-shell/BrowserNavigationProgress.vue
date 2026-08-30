<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";

import type { BrowserLoadPhase } from "@desktop/types";

const props = defineProps<{
  isLoading: boolean;
  phase: BrowserLoadPhase;
}>();

const visible = shallowRef(props.isLoading);
let hideTimer: ReturnType<typeof setTimeout> | undefined;

const scale = computed(() => ({
  "dom-ready": .82,
  committed: .58,
  complete: 1,
  failed: 1,
  idle: 0,
  starting: .24,
})[props.phase]);

watch(
  () => [props.phase, props.isLoading] as const,
  ([phase, loading]) => {
    if (hideTimer) clearTimeout(hideTimer);
    if (loading || !["complete", "idle"].includes(phase)) {
      visible.value = true;
      return;
    }
    visible.value = phase === "complete";
    hideTimer = setTimeout(() => { visible.value = false; }, 180);
  },
  { immediate: true },
);

onBeforeUnmount(() => { if (hideTimer) clearTimeout(hideTimer); });
</script>

<template>
  <div class="navigation-progress" :class="{ visible, failed: phase === 'failed' }"
    aria-hidden="true">
    <span :style="{ transform: `scaleX(${scale})` }" />
  </div>
</template>

<style scoped>
.navigation-progress { height: 2px; overflow: hidden; background: transparent; opacity: 0; }
.navigation-progress.visible { opacity: 1; }
.navigation-progress span { display: block; width: 100%; height: 100%; transform-origin: left;
  background: var(--browser-accent);
  transition: transform 220ms cubic-bezier(.22, 1, .36, 1), opacity 140ms ease-out; }
.navigation-progress.failed span { background: var(--danger); }
@media (prefers-reduced-motion: reduce) {
  .navigation-progress span { transition-duration: .01ms; }
}
</style>
