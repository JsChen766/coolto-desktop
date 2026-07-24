<script setup lang="ts">
import { ArrowUp, FileText, Paperclip, Square, X } from "@lucide/vue";
import { nextTick, ref, watch } from "vue";

import IconButton from "./IconButton.vue";
import type { ResumeChatReference } from "@desktop/types";

const props = defineProps<{
  disabled?: boolean;
  running?: boolean;
  initialValue?: string | undefined;
  initialReference?: ResumeChatReference | undefined;
}>();

const emit = defineEmits<{
  send: [text: string, reference?: ResumeChatReference];
  cancel: [];
}>();

const text = ref(props.initialValue ?? "");
const reference = ref<ResumeChatReference | undefined>(props.initialReference);
const textarea = ref<HTMLTextAreaElement>();

watch(
  () => props.initialValue,
  (value) => {
    if (value !== undefined) {
      text.value = value;
      void nextTick(resize);
    }
  },
);

watch(
  () => props.initialReference,
  (value) => {
    reference.value = value ? structuredClone(value) : undefined;
  },
  { deep: true },
);

function resize(): void {
  const element = textarea.value;
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
}

function send(): void {
  const value = text.value.trim();
  if (!value || props.disabled || props.running) return;
  emit("send", value, reference.value);
  text.value = "";
  reference.value = undefined;
  void nextTick(resize);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    send();
  }
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  const encoded = event.dataTransfer?.getData(
    "application/x-coolto-resume-reference",
  );
  if (!encoded) return;
  try {
    const parsed = JSON.parse(encoded) as ResumeChatReference;
    if (
      parsed &&
      typeof parsed.artifactId === "string" &&
      typeof parsed.targetId === "string" &&
      typeof parsed.label === "string"
    ) {
      reference.value = parsed;
      if (!text.value.trim()) text.value = "请帮我修改这部分内容";
      void nextTick(() => {
        resize();
        textarea.value?.focus();
      });
    }
  } catch {
    return;
  }
}
</script>

<template>
  <footer class="composer-dock">
    <div class="composer" @dragover.prevent @drop="handleDrop">
      <div v-if="reference" class="composer-resume-reference">
        <FileText :size="14" :stroke-width="1.8" aria-hidden="true" />
        <span>
          <small>简历引用</small>
          <strong>{{ reference.label }}</strong>
        </span>
        <button
          type="button"
          aria-label="移除简历引用"
          title="移除简历引用"
          @click="reference = undefined"
        >
          <X :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
      <textarea
        ref="textarea"
        v-model="text"
        rows="1"
        placeholder="给 Coolto 发消息…"
        :disabled="disabled"
        @input="resize"
        @keydown="handleKeydown"
      />
      <div class="composer-actions">
        <div class="composer-left">
          <IconButton
            :icon="Paperclip"
            label="添加附件（即将支持）"
            disabled
            :size="17"
          />
          <span class="composer-hint">Enter 发送 · Shift+Enter 换行</span>
        </div>
        <button
          v-if="running"
          class="send-button"
          type="button"
          aria-label="停止生成"
          title="停止生成"
          @click="$emit('cancel')"
        >
          <Square :size="13" fill="currentColor" :stroke-width="2" />
        </button>
        <button
          v-else
          class="send-button"
          type="button"
          aria-label="发送"
          title="发送"
          :disabled="disabled || !text.trim()"
          @click="send"
        >
          <ArrowUp :size="17" :stroke-width="2.2" />
        </button>
      </div>
    </div>
    <p class="composer-disclaimer">
      Coolto 可能会出错，请核对重要信息与待执行操作。
    </p>
  </footer>
</template>
