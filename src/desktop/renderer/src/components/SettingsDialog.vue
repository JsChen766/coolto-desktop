<script setup lang="ts">
import { ExternalLink, IdCard, MessageSquareText, ShieldCheck, Trash2, X } from "@lucide/vue";
import { computed, nextTick, onMounted, ref } from "vue";

import type { DesktopApi } from "@desktop/types";
import MailConnectionsSettings from "./MailConnectionsSettings.vue";
import CalendarSettings from "./CalendarSettings.vue";
import AiNativeAutomationSettings from "./AiNativeAutomationSettings.vue";

const props = defineProps<{ api: DesktopApi; conversationId: string }>();
const emit = defineEmits<{
  close: [];
  openProfile: [];
  openAgentTask: [taskId: string];
}>();
const dialog = ref<HTMLElement>();
const confirmingClear = ref(false);
const clearing = ref(false);
const clearResult = ref<"success" | "error">();
const clearError = ref<string>();
const feedbackError = ref<string>();

const FEEDBACK_FORM_URL =
  "https://gjp785oqywpv.jp.larksuite.com/share/base/form/shrjpRBazL52SDCRqU2gJI8489c";

onMounted(() => {
  dialog.value?.querySelector<HTMLElement>("[data-settings-initial-focus]")?.focus();
});

const clearButtonLabel = computed(() => {
  if (clearing.value) return "正在清除…";
  if (confirmingClear.value) return "再次确认清除";
  return "清除本地数据";
});

async function startClear(): Promise<void> {
  if (!confirmingClear.value) {
    confirmingClear.value = true;
    return;
  }
  clearing.value = true;
  clearResult.value = undefined;
  clearError.value = undefined;
  try {
    await props.api.data.clearLocal();
    clearResult.value = "success";
    confirmingClear.value = false;
    window.setTimeout(() => window.location.reload(), 900);
  } catch (error: unknown) {
    clearError.value = error instanceof Error ? error.message : String(error);
    clearResult.value = "error";
    confirmingClear.value = false;
  } finally {
    clearing.value = false;
  }
}

function dismiss(): void {
  emit("close");
}

function openProfile(): void {
  emit("openProfile");
}

async function openFeedback(): Promise<void> {
  feedbackError.value = undefined;
  try {
    await props.api.shell.openExternal(FEEDBACK_FORM_URL);
  } catch (error: unknown) {
    feedbackError.value = error instanceof Error ? error.message : String(error);
  }
}

function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    dismiss();
    return;
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
  )].filter((element) => !element.hidden);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div class="dialog-backdrop settings-dialog-backdrop" @mousedown.self="dismiss">
    <section
      ref="dialog"
      class="dialog-card settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      tabindex="-1"
      @keydown="keydown"
    >
      <header class="settings-dialog-header">
        <div>
          <h2 id="settings-dialog-title">{{ $t('设置') }}</h2>
          <p>{{ $t('管理你的个人资料、隐私与本地数据。') }}</p>
        </div>
        <button class="icon-button" type="button" :aria-label="$t('关闭设置')" @click="dismiss">
          <X :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <section class="settings-section">
        <div class="settings-section-title icon-label">
          <IdCard :size="15" :stroke-width="1.8" aria-hidden="true" />
          <h3>{{ $t('个人档案') }}</h3>
        </div>
        <p class="settings-section-desc">
          {{ $t('查看和编辑你的联系方式与职业画像，Agent 会使用这些信息生成简历。') }}
        </p>
        <button class="secondary-button settings-section-action" type="button" data-settings-initial-focus @click="openProfile">
          {{ $t('编辑个人信息') }}
        </button>
      </section>

      <MailConnectionsSettings :api="api" :conversation-id="conversationId"
        @started="$emit('openAgentTask', $event)" />
      <CalendarSettings :api="api" />
      <AiNativeAutomationSettings :api="api" :conversation-id="conversationId"
        @started="$emit('openAgentTask', $event)" />

      <section class="settings-section">
        <div class="settings-section-title icon-label">
          <MessageSquareText :size="15" :stroke-width="1.8" aria-hidden="true" />
          <h3>{{ $t('帮助与反馈') }}</h3>
        </div>
        <p class="settings-section-desc">
          {{ $t('遇到问题或有功能建议，可以通过反馈表单告诉我们。表单会在系统浏览器中打开，Coolto 不会自动附带你的邮箱、简历或聊天内容。') }}
        </p>
        <button class="secondary-button settings-section-action" type="button" @click="openFeedback">
          <ExternalLink :size="14" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ $t('提交反馈') }}</span>
        </button>
        <p v-if="feedbackError" class="form-error" role="alert">{{ feedbackError }}</p>
      </section>

      <section class="settings-section">
        <div class="settings-section-title icon-label">
          <ShieldCheck :size="15" :stroke-width="1.8" aria-hidden="true" />
          <h3>{{ $t('隐私与数据') }}</h3>
        </div>
        <p class="settings-section-desc">
          {{ $t('LLM 仅在发起任务时处理你的经历、JD 与简历内容；业务数据加密保存在本机与 Coolto 云端服务，对话记录仅保存在本机。') }}
        </p>
        <p v-if="!confirmingClear" class="settings-section-desc">
          {{ $t('清除本地数据会删除本机的对话历史、简历草稿与同步缓存；云端数据不受影响，重新同步后会再次拉取。') }}
        </p>
        <p v-else class="settings-clear-warning" role="alert">
          {{ $t('确认清除？本机对话历史、简历草稿与同步缓存将被永久删除，无法恢复。') }}
        </p>
        <div class="settings-section-actions">
          <button
            v-if="confirmingClear"
            class="secondary-button"
            type="button"
            :disabled="clearing"
            @click="confirmingClear = false"
          >
            {{ $t('取消') }}
          </button>
          <button
            class="secondary-button danger-text"
            type="button"
            :disabled="clearing"
            @click="startClear"
          >
            <Trash2 :size="14" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ $t(clearButtonLabel) }}</span>
          </button>
        </div>
        <p v-if="clearResult === 'success'" class="settings-clear-success" role="status">
          {{ $t('本地数据已清除，正在重新加载…') }}
        </p>
        <p v-if="clearError" class="form-error" role="alert">{{ clearError }}</p>
      </section>

      <section class="settings-section">
        <div class="settings-section-title icon-label">
          <ShieldCheck :size="15" :stroke-width="1.8" aria-hidden="true" />
          <h3>{{ $t('偏好') }}</h3>
        </div>
        <p class="settings-section-desc">
          {{ $t('主题与语言可在左下角账户菜单中切换。') }}
        </p>
      </section>
    </section>
  </div>
</template>
