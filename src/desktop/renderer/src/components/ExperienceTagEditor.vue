<script setup lang="ts">
import { X } from "@lucide/vue";

import type { ExperienceFormErrors } from "../experiences/experience-form";
import { normalizeExperienceTags } from "../experiences/experience-form";

const props = defineProps<{
  tags: string[];
  input: string;
  errors: ExperienceFormErrors;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  update: [value: { tags: string[]; tagInput: string }];
}>();

function commit(): void {
  emit("update", {
    tags: normalizeExperienceTags(props.tags, props.input).slice(0, 40),
    tagInput: "",
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== "," && event.key !== "，") return;
  event.preventDefault();
  commit();
}

function remove(tag: string): void {
  emit("update", {
    tags: props.tags.filter((value) => value !== tag),
    tagInput: props.input,
  });
}
</script>

<template>
  <label class="experience-form-field experience-tag-field">
    <span>标签</span>
    <div class="experience-tag-editor" :class="{ disabled }">
      <span v-for="tag in tags" :key="tag" class="experience-tag-chip">
        {{ tag }}
        <button
          type="button"
          :disabled="disabled"
          :aria-label="`移除标签 ${tag}`"
          @click="remove(tag)"
        >
          <X :size="12" aria-hidden="true" />
        </button>
      </span>
      <input
        :value="input"
        :disabled="disabled || tags.length >= 40"
        aria-label="添加标签"
        placeholder="输入后按 Enter 或逗号"
        @input="$emit('update', {
          tags,
          tagInput: ($event.target as HTMLInputElement).value,
        })"
        @keydown="onKeydown"
        @blur="commit"
      />
    </div>
    <small v-if="errors.tags" class="experience-field-error">{{ errors.tags }}</small>
  </label>
</template>
