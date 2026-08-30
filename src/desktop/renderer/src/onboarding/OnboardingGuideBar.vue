<script setup lang="ts">
import { ArrowRight, LoaderCircle, RotateCw } from "@lucide/vue";

defineProps<{
  index: number;
  title: string;
  description: string;
  actionLabel?: string | undefined;
  secondaryLabel?: string | undefined;
  busy?: boolean;
  error?: string | undefined;
  aboveComposer?: boolean;
}>();

defineEmits<{
  action: [];
  secondary: [];
}>();
</script>

<template>
  <aside
    class="onboarding-guide-bar"
    :class="{ 'above-composer': aboveComposer }"
    role="status"
    aria-live="polite"
  >
    <span class="onboarding-guide-index">{{ index }}</span>
    <span class="onboarding-guide-copy">
      <strong>{{ $t(title) }}</strong>
      <small>{{ $t(description) }}</small>
      <small v-if="error" class="onboarding-guide-error" role="alert">{{ error }}</small>
    </span>
    <span class="onboarding-guide-actions">
      <button
        v-if="secondaryLabel"
        class="onboarding-guide-secondary"
        type="button"
        :disabled="busy"
        @click="$emit('secondary')"
      >
        <RotateCw :size="14" aria-hidden="true" />{{ $t(secondaryLabel) }}
      </button>
      <button
        v-if="actionLabel"
        class="onboarding-guide-primary"
        type="button"
        :disabled="busy"
        @click="$emit('action')"
      >
        <LoaderCircle v-if="busy" class="spin" :size="14" aria-hidden="true" />
        <span>{{ $t(actionLabel) }}</span>
        <ArrowRight v-if="!busy" :size="14" aria-hidden="true" />
      </button>
    </span>
  </aside>
</template>

<style scoped>
.onboarding-guide-bar {
  position: absolute;
  z-index: 40;
  right: 16px;
  bottom: 16px;
  left: 16px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 11px 12px;
  border-radius: 11px;
  background: var(--text);
  color: var(--bg);
  box-shadow: var(--shadow-menu);
}
.onboarding-guide-bar.above-composer { bottom: 116px; }
.onboarding-guide-index {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 16%, transparent);
  font-variant-numeric: tabular-nums;
}
.onboarding-guide-copy { display: grid; gap: 2px; min-width: 0; }
.onboarding-guide-copy strong { font-size: 13px; font-weight: 600; }
.onboarding-guide-copy small { color: color-mix(in srgb, var(--bg) 72%, transparent); }
.onboarding-guide-error { color: var(--danger) !important; }
.onboarding-guide-actions { display: flex; align-items: center; gap: 7px; }
.onboarding-guide-actions button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.onboarding-guide-primary { border: 0; background: var(--bg); color: var(--text); }
.onboarding-guide-secondary {
  border: 1px solid color-mix(in srgb, var(--bg) 28%, transparent);
  background: transparent;
  color: var(--bg);
}
@media (max-width: 700px) {
  .onboarding-guide-bar { grid-template-columns: auto minmax(0, 1fr); }
  .onboarding-guide-actions { grid-column: 1 / -1; justify-content: flex-end; }
}
</style>
