<script setup lang="ts">
import { ChevronDown, ChevronUp, Search, X } from "@lucide/vue";
import { computed, nextTick, shallowRef, useTemplateRef } from "vue";

import type { BrowserFindState } from "@desktop/types";

const props = defineProps<{ state: BrowserFindState }>();
const emit = defineEmits<{
  query: [value: string];
  next: [query: string];
  previous: [query: string];
  close: [];
}>();

const queryInput = useTemplateRef<HTMLInputElement>("queryInput");
const draft = shallowRef(props.state.query);
let lastEmittedQuery = props.state.query;
const hasMatches = computed(() => draft.value.trim().length > 0
  && props.state.matches > 0);
const matchLabel = computed(() => props.state.matches > 0
  ? `${props.state.activeMatchOrdinal}/${props.state.matches}`
  : "0/0");

async function focusInput(): Promise<void> {
  await nextTick();
  queryInput.value?.focus();
  queryInput.value?.select();
}

defineExpose({ focusInput });

function handleInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  draft.value = value;
  if (!(event as InputEvent).isComposing) emitQuery(value);
}

function handleCompositionEnd(event: CompositionEvent): void {
  const value = (event.target as HTMLInputElement).value;
  draft.value = value;
  emitQuery(value);
}

function emitQuery(value: string): void {
  if (value === lastEmittedQuery) return;
  lastEmittedQuery = value;
  emit("query", value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  if (event.key === "Enter") {
    event.preventDefault();
    if (!draft.value) return;
    if (event.shiftKey) emit("previous", draft.value);
    else emit("next", draft.value);
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    emit("close");
  }
}
</script>

<template>
  <div class="find-bar no-drag" role="search" :aria-label="$t('在页面中查找')">
    <Search class="find-icon" :size="15" :stroke-width="1.8" aria-hidden="true" />
    <input
      ref="queryInput"
      class="find-input"
      type="text"
      :value="draft"
      :placeholder="$t('在页面中查找')"
      :aria-label="$t('在页面中查找')"
      autocomplete="off"
      maxlength="1000"
      spellcheck="false"
      @input="handleInput"
      @compositionend="handleCompositionEnd"
      @keydown="handleKeydown"
    />
    <span class="match-count" role="status" aria-live="polite" aria-atomic="true">
      {{ matchLabel }}
    </span>
    <button class="find-action" type="button" :disabled="!hasMatches"
      :aria-label="$t('上一个匹配项')" :title="$t('上一个匹配项')"
      @click="emit('previous', draft)">
      <ChevronUp :size="16" :stroke-width="1.9" aria-hidden="true" />
    </button>
    <button class="find-action" type="button" :disabled="!hasMatches"
      :aria-label="$t('下一个匹配项')" :title="$t('下一个匹配项')"
      @click="emit('next', draft)">
      <ChevronDown :size="16" :stroke-width="1.9" aria-hidden="true" />
    </button>
    <button class="find-action" type="button" :aria-label="$t('关闭查找')"
      :title="$t('关闭查找')" @click="emit('close')">
      <X :size="16" :stroke-width="1.9" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.find-bar {
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap: 4px;
  width: min(360px, calc(100% - 16px));
  min-height: 40px;
  margin: 6px 8px;
  padding: 5px 6px 5px 10px;
  border-radius: 9px;
  background: var(--surface);
  box-shadow: var(--shadow-menu);
  color: var(--text);
}

.find-bar:focus-within { outline: 2px solid var(--browser-accent); outline-offset: -2px; }
.find-icon { flex: none; color: var(--muted); }
.find-input { flex: 1 1 auto; min-width: 0; height: 28px; padding: 0 4px; border: 0;
  outline: 0; background: transparent; color: var(--text); font: inherit; font-size: 13px; }
.find-input::placeholder { color: var(--text-soft); }
.match-count { flex: none; min-width: 40px; color: var(--text-soft); font-size: 12px;
  font-variant-numeric: tabular-nums; text-align: center; }
.find-action { display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--text-soft); transition: background-color 140ms ease-out,
  color 140ms ease-out, opacity 140ms ease-out; }
.find-action:hover:not(:disabled) { background: var(--surface-strong); color: var(--text); }
.find-action:disabled { opacity: 0.35; }
.find-action:focus-visible { outline: 2px solid var(--browser-accent); outline-offset: -2px; }

@media (prefers-reduced-motion: reduce) {
  .find-action { transition: none; }
}
</style>
