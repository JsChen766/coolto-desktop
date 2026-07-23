<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  mode: "rename" | "delete";
  title: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [value?: string];
}>();

const value = ref(props.title);
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section
      class="dialog-card"
      role="dialog"
      aria-modal="true"
      :aria-label="mode === 'rename' ? '重命名对话' : '删除对话'"
    >
      <template v-if="mode === 'rename'">
        <h2>重命名对话</h2>
        <p>使用一个便于之后查找的标题。</p>
        <input
          v-model="value"
          autofocus
          maxlength="80"
          @keydown.enter.prevent="$emit('confirm', value)"
        />
      </template>
      <template v-else>
        <h2>删除这个对话？</h2>
        <p>“{{ title }}”及其本地聊天记录将被永久删除。</p>
      </template>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" @click="$emit('close')">
          取消
        </button>
        <button
          class="primary-button"
          :class="{ danger: mode === 'delete' }"
          type="button"
          :disabled="mode === 'rename' && !value.trim()"
          @click="$emit('confirm', mode === 'rename' ? value : undefined)"
        >
          {{ mode === "rename" ? "保存" : "删除" }}
        </button>
      </div>
    </section>
  </div>
</template>
