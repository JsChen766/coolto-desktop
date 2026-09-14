<script setup lang="ts">
import type { ResumeChatReference } from "@desktop/types";
import Composer from "../components/Composer.vue";
import { publishComposerDraft } from "../chat/composer-draft-channel";
import { useComposerPageHandoff } from "../chat/use-composer-page-handoff";
import type { AppShell } from "./use-app-shell";

const props = defineProps<{
  shell: AppShell;
  disabled?: boolean;
  guided?: boolean;
  guidedText?: string | undefined;
  guidedHighlight?: boolean;
}>();

const emit = defineEmits<{
  guidedFocus: [];
  guidedSend: [text: string];
}>();

const {
  conversationAttachment,
  cloudCopyRequested,
  clearResumeOperationContext,
  desktopApi,
  requestCloudResumeCopy,
  resumeOperationContext,
  running,
} = props.shell;

useComposerPageHandoff({
  draft: publishComposerDraft,
  analyze: (text) => { void props.shell.send(text); },
  blocked: () => Boolean(props.disabled || props.guided || running.value),
});

function send(text: string, reference?: ResumeChatReference): void {
  if (props.guided) {
    emit("guidedSend", text);
    return;
  }
  void props.shell.send(text, reference);
}
</script>

<template>
  <Composer
    :disabled="disabled"
    :running="running"
    :attachment="conversationAttachment.attachment.value"
    :attachment-busy="conversationAttachment.selecting.value"
    :attachment-error="conversationAttachment.error.value"
    :resume-context="resumeOperationContext"
    :cloud-copy-requested="cloudCopyRequested"
    :guided="guided"
    :guided-text="guidedText"
    :guided-highlight="guidedHighlight"
    @focus="$emit('guidedFocus')"
    @send="send"
    @cancel="desktopApi.agent.cancel"
    @select-attachment="conversationAttachment.select"
    @select-attachment-file="conversationAttachment.selectFile"
    @remove-attachment="conversationAttachment.remove"
    @clear-resume-context="clearResumeOperationContext"
    @request-local-copy="requestCloudResumeCopy"
  />
</template>
