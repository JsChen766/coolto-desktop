<script setup lang="ts">
import { Radar } from "@lucide/vue";
import { onMounted, ref } from "vue";
import type { DesktopApi, MailConnectionView } from "@desktop/types";
import GlobalAiLoopDialog from "../agent-tasks/GlobalAiLoopDialog.vue";

const props = defineProps<{ api: DesktopApi; conversationId: string }>();
const emit = defineEmits<{ started: [taskId: string] }>();
const connections = ref<MailConnectionView[]>([]);
const open = ref<"strategy" | "risk">();
const error = ref<string>();
async function load(): Promise<void> {
  try { connections.value = await props.api.mailConnections.list(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
}
onMounted(load);
async function show(kind: "strategy" | "risk"): Promise<void> {
  error.value = undefined;
  if (kind === "risk") await load();
  open.value = kind;
}
</script>

<template>
  <section class="settings-section">
    <div class="settings-section-title icon-label"><Radar :size="15" :stroke-width="1.8" aria-hidden="true" /><h3>{{ $t('AI Native 自动化') }}</h3></div>
    <p class="settings-section-desc">{{ $t('让 Agent 定期复盘投递策略，或监控求职邮件中的截止日期与风险。建议和提醒均保留确认边界。') }}</p>
    <div class="settings-section-actions">
      <button class="secondary-button" type="button" @click="show('strategy')">{{ $t('策略复盘') }}</button>
      <button class="secondary-button" type="button" @click="show('risk')">{{ $t('风险与截止监控') }}</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <GlobalAiLoopDialog v-if="open" :api="api" :conversation-id="conversationId"
      :connections="connections" :kind="open" @close="open = undefined"
      @started="open = undefined; emit('started', $event)" />
  </section>
</template>
