<script setup lang="ts">
import { ArrowUp, FileText, Paperclip, Square, X } from "@lucide/vue";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import IconButton from "./IconButton.vue";
import type { ResumeChatReference } from "@desktop/types";
import { subscribeResumeReference } from "../resume-workspace/resume-reference-channel";

const props = defineProps<{
  disabled?: boolean;
  running?: boolean;
}>();

const emit = defineEmits<{
  send: [text: string, reference?: ResumeChatReference];
  cancel: [];
}>();

const text = ref("");
const reference = ref<ResumeChatReference>();
const textarea = ref<HTMLTextAreaElement>();
const dragActive = ref(false);
let unsubscribeReference: (() => void) | undefined;

onMounted(() => {
  unsubscribeReference = subscribeResumeReference(selectReference);
});

onBeforeUnmount(() => unsubscribeReference?.());

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
  dragActive.value = false;
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
      selectReference(parsed);
    }
  } catch {
    return;
  }
}

function selectReference(selected: ResumeChatReference): void {
  reference.value = structuredClone(selected);
  if (!text.value.trim()) text.value = "请帮我修改这部分内容";
  void nextTick(() => {
    resize();
    textarea.value?.focus();
  });
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  dragActive.value = true;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function handleDragLeave(event: DragEvent): void {
  const container = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (!container || !related || !container.contains(related)) {
    dragActive.value = false;
  }
}
</script>

<template>
  <footer class="composer-dock">
    <div
      class="composer"
      :class="{ 'drag-active': dragActive }"
      @dragenter.prevent="dragActive = true"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div v-if="dragActive" class="composer-drop-hint">
        <FileText :size="14" :stroke-width="1.8" aria-hidden="true" />
        松开后引用到聊天
      </div>
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
