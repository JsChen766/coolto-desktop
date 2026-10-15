<script setup lang="ts">
import { SlidersHorizontal, X } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { MaterialView } from "@desktop/types/material";

const props = defineProps<{ status: MaterialView["status"] | "" }>();
const emit = defineEmits<{
  "update:status": [value: MaterialView["status"] | ""];
  clear: [];
}>();

const open = ref(false);
const root = ref<HTMLElement>();

const options: { value: MaterialView["status"] | ""; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "unclassified", label: "未归类" },
  { value: "needs_confirmation", label: "待确认" },
  { value: "ready", label: "已整理" },
  { value: "expired", label: "OCR 已过期" },
  { value: "failed", label: "处理失败" },
];

const activeLabel = computed(() =>
  options.find((option) => option.value === props.status)?.label ?? "全部状态",
);
const count = computed(() => props.status ? 1 : 0);

function pick(value: MaterialView["status"] | ""): void {
  emit("update:status", value);
  open.value = false;
}

function closeOutside(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === "Escape") open.value = false;
}

onMounted(() => {
  window.addEventListener("click", closeOutside);
  window.addEventListener("keydown", closeOnEscape);
});
onBeforeUnmount(() => {
  window.removeEventListener("click", closeOutside);
  window.removeEventListener("keydown", closeOnEscape);
});
</script>

<template>
  <div ref="root" class="repository-filter material-status-filter">
    <button
      class="repository-filter-trigger"
      type="button"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click.stop="open = !open"
    >
      <SlidersHorizontal :size="15" aria-hidden="true" />
      {{ $t(activeLabel) }}
      <span v-if="count">{{ count }}</span>
    </button>
    <div
      v-if="open"
      class="popover repository-filter-popover material-status-filter-popover"
      role="dialog"
      :aria-label="$t('按状态筛选')"
      @click.stop
    >
      <div class="repository-filter-heading">
        <strong>{{ $t('按状态筛选') }}</strong>
        <button type="button" :aria-label="$t('关闭筛选')" @click="open = false">
          <X :size="15" aria-hidden="true" />
        </button>
      </div>
      <div class="material-status-filter-options" role="listbox">
        <button
          v-for="option in options"
          :key="option.value || 'all'"
          type="button"
          role="option"
          :aria-selected="status === option.value"
          :class="{ active: status === option.value }"
          @click="pick(option.value)"
        >
          {{ $t(option.label) }}
        </button>
      </div>
      <button
        v-if="count"
        class="secondary-button repository-filter-clear"
        type="button"
        @click="$emit('clear'); open = false"
      >
        {{ $t('清除筛选') }}
      </button>
    </div>
  </div>
</template>
