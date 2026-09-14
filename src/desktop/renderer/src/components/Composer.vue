<script setup lang="ts">
import { ArrowUp, FileText, Paperclip, Plus, Square, X } from "@lucide/vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
} from "vue";
import ComposerResumeContext from "./ComposerResumeContext.vue";
import IconButton from "./IconButton.vue";
import ResumePickerPopup from "./ResumePickerPopup.vue";
import type { ResumeChatReference } from "@desktop/types";
import { attachmentStatus, fileSize } from "../attachments/attachment-formatters";
import { subscribeComposerDraft } from "../chat/composer-draft-channel";
import { subscribeResumeReference } from "../resume-workspace/resume-reference-channel";
import { translate } from "../i18n/locale";
import { useComposerDrop } from "../chat/use-composer-drop";
import { useGuidedComposer } from "../chat/use-guided-composer";
import type { ComposerProps } from "./composer-props";

const props = defineProps<ComposerProps>();

const emit = defineEmits<{
  send: [text: string, reference?: ResumeChatReference];
  cancel: [];
  selectAttachment: [];
  selectAttachmentFile: [file: File];
  removeAttachment: [];
  clearResumeContext: [];
  requestLocalCopy: [];
  focus: [];
}>();

const text = ref("");
const reference = ref<ResumeChatReference>();
const pickerOpen = ref(false);
const textarea = useTemplateRef<HTMLTextAreaElement>("textarea");
const effectiveReference = computed(() => reference.value ?? props.resumeContext);
let unsubscribeReference: (() => void) | undefined;
let unsubscribeDraft: (() => void) | undefined;

const {
  dragActive,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  handleFileInput,
} = useComposerDrop({
  selectAttachmentFile: (file) => emit("selectAttachmentFile", file),
  selectResumeReference: selectReference,
});

onMounted(() => {
  unsubscribeReference = subscribeResumeReference(selectReference);
  unsubscribeDraft = subscribeComposerDraft(fillDraft);
});

onBeforeUnmount(() => {
  unsubscribeReference?.();
  unsubscribeDraft?.();
});

function resize(): void {
  const element = textarea.value;
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
}
function fillDraft(value: string): void {
  text.value = value;
  void nextTick(() => { resize(); textarea.value?.focus(); });
}
const guidance = useGuidedComposer({
  preset: () => props.guidedText,
  text,
  resized: () => void nextTick(resize),
});

function send(): void {
  const value = text.value.trim();
  if (!value || props.disabled || props.running || guidance.typing.value) return;
  emit("send", value, effectiveReference.value);
  text.value = "";
  reference.value = undefined;
  void nextTick(resize);
}

function clearReference(): void {
  if (reference.value) reference.value = undefined;
  else emit("clearResumeContext");
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    send();
  }
}

function handlePick(selected: ResumeChatReference): void {
  pickerOpen.value = false;
  selectReference(selected);
}

function selectReference(selected: ResumeChatReference): void {
  reference.value = structuredClone(selected);
  if (!text.value.trim()) text.value = translate("请帮我修改这部分内容");
  void nextTick(() => {
    resize();
    textarea.value?.focus();
  });
}

</script>

<template>
  <footer class="composer-dock" data-testid="chat-composer">
    <div
      class="composer"
      data-testid="chat-composer-surface"
      :class="{ 'drag-active': dragActive, 'guided-highlight': guidedHighlight }"
      @dragenter.prevent="dragActive = true"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div v-if="dragActive" class="composer-drop-hint">
        <FileText :size="14" :stroke-width="1.8" aria-hidden="true" />
        {{ $t('松开后引用到聊天') }}
      </div>
      <div
        v-if="attachment"
        class="composer-attachment"
        data-testid="chat-composer-attachment"
      >
        <FileText :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span class="composer-attachment-copy">
          <span class="composer-attachment-name">{{ attachment.filename }}</span>
          <small>
            {{ $t('仅本机') }} · {{ fileSize(attachment.sizeBytes) }} ·
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
          :aria-label="$t('移除附件')"
          :title="$t('移除附件')"
          :disabled="running"
          @click="$emit('removeAttachment')"
        >
          <X :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
      <p
        v-if="attachmentError"
        class="composer-attachment-error"
        data-testid="chat-composer-attachment-error"
      >
        {{ attachmentError }}
      </p>
      <ComposerResumeContext
        v-if="effectiveReference"
        :reference="effectiveReference"
        :context="!reference && Boolean(resumeContext)"
        :copy-requested="cloudCopyRequested"
        @clear="clearReference"
        @create-local-copy="$emit('requestLocalCopy')"
      />
      <input
        hidden
        type="file"
        tabindex="-1"
        aria-hidden="true"
        data-testid="chat-composer-file"
        accept=".pdf,.docx,.txt,.md,.markdown"
        @change="handleFileInput"
      />
      <textarea
        ref="textarea"
        v-model="text"
        rows="1"
        data-testid="chat-composer-input"
        :aria-label="$t('消息输入框')"
        :placeholder="$t('给 Coolto 发消息…')"
        :disabled="disabled"
        :readonly="guided"
        @input="resize"
        @focus="$emit('focus')"
        @keydown="handleKeydown"
      />
      <div class="composer-actions">
        <div class="composer-left">
          <IconButton
            :icon="Plus"
            :label="$t('选择已有简历')"
            :disabled="disabled || running || guided"
            :size="17"
            @click="pickerOpen = true"
          />
          <IconButton
            :icon="Paperclip"
            :label="$t('选择经历材料')"
            :disabled="disabled || running || attachmentBusy || guided"
            :size="17"
            @click="$emit('selectAttachment')"
          />
          <span class="composer-hint">{{ $t('Enter 发送 · Shift+Enter 换行') }}</span>
        </div>
        <button
          v-if="running"
          class="send-button"
          type="button"
          data-testid="chat-composer-stop"
          :aria-label="$t('停止生成')"
          :title="$t('停止生成')"
          @click="$emit('cancel')"
        >
          <Square :size="13" fill="currentColor" :stroke-width="2" />
        </button>
        <button
          v-else
          class="send-button"
          type="button"
          data-testid="chat-composer-send"
          :aria-label="$t('发送')"
          :title="$t('发送')"
          :disabled="disabled || guidance.typing.value || !text.trim()"
          @click="send"
        >
          <ArrowUp :size="17" :stroke-width="2.2" />
        </button>
      </div>
    </div>
    <p class="composer-disclaimer">{{ $t('发送后会把当前对话、引用/上传材料和必要岗位、经历或简历摘录交给模型。Coolto 可能会出错，请核对重要信息。') }}</p>
    <ResumePickerPopup
      v-if="pickerOpen"
      @select="handlePick"
      @close="pickerOpen = false"
    />
  </footer>
</template>
