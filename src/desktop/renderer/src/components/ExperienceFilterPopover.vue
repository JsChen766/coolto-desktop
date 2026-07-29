<script setup lang="ts">
import { Check, SlidersHorizontal, X } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { ExperienceCategory } from "@desktop/types";
import { EXPERIENCE_CATEGORY_LABELS } from "../../../../experience/timeline-labels";

const props = defineProps<{
  category: ExperienceCategory | "";
  status: "active" | "archived";
  tags: string[];
  availableTags: string[];
  count: number;
}>();
const emit = defineEmits<{
  "update:category": [value: ExperienceCategory | ""];
  "update:status": [value: "active" | "archived"];
  toggleTag: [tag: string];
  clear: [];
}>();

const open = ref(false);
const root = ref<HTMLElement>();
const categoryOptions = computed(() => Object.entries(EXPERIENCE_CATEGORY_LABELS));
const displayTags = computed(() => [
  ...new Set([...props.tags, ...props.availableTags]),
].sort((a, b) => a.localeCompare(b, "zh-CN")));

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
  <div ref="root" class="experience-filter">
    <button
      class="experience-filter-trigger"
      type="button"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click.stop="open = !open"
    >
      <SlidersHorizontal :size="15" aria-hidden="true" />
      筛选
      <span v-if="count">{{ count }}</span>
    </button>
    <div
      v-if="open"
      class="popover experience-filter-popover"
      role="dialog"
      aria-label="筛选经历"
      @click.stop
    >
      <div class="experience-filter-heading">
        <strong>筛选经历</strong>
        <button type="button" aria-label="关闭筛选" @click="open = false">
          <X :size="15" aria-hidden="true" />
        </button>
      </div>
      <label>
        <span>状态</span>
        <select
          :value="status"
          @change="$emit('update:status', ($event.target as HTMLSelectElement).value as 'active' | 'archived')"
        >
          <option value="active">在用经历</option>
          <option value="archived">已归档</option>
        </select>
      </label>
      <label>
        <span>类别</span>
        <select
          :value="category"
          @change="$emit('update:category', ($event.target as HTMLSelectElement).value as ExperienceCategory | '')"
        >
          <option value="">全部类别</option>
          <option v-for="[value, label] in categoryOptions" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <fieldset>
        <legend>标签 <small>同时满足所选标签</small></legend>
        <p v-if="!displayTags.length">当前状态下暂无标签</p>
        <button
          v-for="tag in displayTags"
          :key="tag"
          type="button"
          :class="{ selected: tags.includes(tag) }"
          :aria-pressed="tags.includes(tag)"
          @click="$emit('toggleTag', tag)"
        >
          <Check v-if="tags.includes(tag)" :size="12" aria-hidden="true" />
          {{ tag }}
        </button>
      </fieldset>
      <button
        class="experience-filter-clear"
        type="button"
        :disabled="!count"
        @click="$emit('clear')"
      >
        清空筛选
      </button>
    </div>
  </div>
</template>
