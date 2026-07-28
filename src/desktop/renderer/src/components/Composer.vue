<script setup lang="ts">
import { ArrowUp, FileText, Paperclip, Plus, Square, X } from "@lucide/vue";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import IconButton from "./IconButton.vue";
import ResumePickerPopup from "./ResumePickerPopup.vue";
import type { ResumeChatReference } from "@desktop/types";
import type { AttachmentView } from "../attachments/use-conversation-attachment";
import { attachmentStatus, fileSize } from "../attachments/attachment-formatters";
import { subscribeResumeReference } from "../resume-workspace/resume-reference-channel";

const props = defineProps<{
  disabled?: boolean;
  running?: boolean;
  attachment?: AttachmentView | undefined;
  attachmentBusy?: boolean;
  attachmentError?: string | undefined;
}>();

const emit = defineEmits<{
  send: [text: string, reference?: ResumeChatReference];
  cancel: [];
  selectAttachment: [];
  removeAttachment: [];
}>();

const text = ref("");
const DEFAULT_ATTACHMENT_PROMPT = "请解析并导入这份简历中的经历";
const reference = ref<ResumeChatReference>();
const pickerOpen = ref(false);
const textarea = ref<HTMLTextAreaElement>();
const dragActive = ref(false);
let unsubscribeReference: (() => void) | undefined;

onMounted(() => {
  unsubscribeReference = subscribeResumeReference(selectReference);
});

onBeforeUnmount(() => unsubscribeReference?.());

watch(
  () => props.attachment?.id,
  (id, previous) => {
    if (id && id !== previous && !text.value.trim()) {
      text.value = DEFAULT_ATTACHMENT_PROMPT;
      void nextTick(() => {
        resize();
        textarea.value?.focus();
      });
    } else if (!id && previous && text.value === DEFAULT_ATTACHMENT_PROMPT) {
      text.value = "";
      void nextTick(resize);
    }
  },
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

function handlePick(selected: ResumeChatReference): void {
  pickerOpen.value = false;
  selectReference(selected);
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
      <div v-if="attachment" class="composer-attachment">
        <FileText :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span class="composer-attachment-copy">
          <span class="composer-attachment-name">{{ attachment.filename }}</span>
          <small>
            仅本机 · {{ fileSize(attachment.sizeBytes) }} ·
            <span :class="`attachment-status-${attachment.status}`">
              {{ attachmentStatus(attachment) }}
            </span>
          </small>
          <small v-if="attachment.message" class="composer-attachment-message">
            {{ attachment.message }}
          </small>
        </span>
        <button
          type="button"
          aria-label="移除附件"
          title="移除附件"
          :disabled="running"
          @click="$emit('removeAttachment')"
        >
          <X :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
      <p v-if="attachmentError" class="composer-attachment-error">
        {{ attachmentError }}
      </p>
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
            :icon="Plus"
            label="选择已有简历"
            :disabled="disabled || running"
            :size="17"
            @click="pickerOpen = true"
          />
          <IconButton
            :icon="Paperclip"
            label="选择简历附件"
            :disabled="disabled || running || attachmentBusy"
            :size="17"
            @click="$emit('selectAttachment')"
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
    <ResumePickerPopup
      v-if="pickerOpen"
      @select="handlePick"
      @close="pickerOpen = false"
    />
  </footer>
</template>
