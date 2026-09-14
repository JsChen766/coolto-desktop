<script setup lang="ts">
import { ExternalLink, IdCard, MessageSquareText, ShieldCheck, X } from "@lucide/vue";
import { nextTick, onMounted, ref } from "vue";

import type { DesktopApi } from "@desktop/types";
import MailConnectionsSettings from "./MailConnectionsSettings.vue";
import CalendarSettings from "./CalendarSettings.vue";
import AiNativeAutomationSettings from "./AiNativeAutomationSettings.vue";
import PrivacyDataSection from "./PrivacyDataSection.vue";

const props = defineProps<{ api: DesktopApi; conversationId: string }>();
const emit = defineEmits<{
  close: [];
  openProfile: [];
  openPreferences: [];
  openAgentTask: [taskId: string];
}>();
const dialog = ref<HTMLElement>();
const feedbackError = ref<string>();

const FEEDBACK_FORM_URL =
  "https://gjp785oqywpv.jp.larksuite.com/share/base/form/shrjpRBazL52SDCRqU2gJI8489c";

onMounted(() => {
  dialog.value?.querySelector<HTMLElement>("[data-settings-initial-focus]")?.focus();
});


function dismiss(): void {
  emit("close");
}

function openProfile(): void {
  emit("openProfile");
}
function openPreferences(): void {
  emit("openPreferences");
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
  if (event.key !== "Tab") return;
  if (event.target instanceof HTMLElement &&
      event.target.closest(".privacy-data-dialog")) return;
  if (!dialog.value) return;
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
      aria-describedby="settings-dialog-description"
      tabindex="-1"
      @keydown="keydown"
    >
      <header class="settings-dialog-header">
        <div>
          <h2 id="settings-dialog-title">{{ $t('设置') }}</h2>
          <p id="settings-dialog-description">{{ $t('管理你的个人资料、隐私与本地数据。') }}</p>
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

      <PrivacyDataSection :api="api" />

      <section class="settings-section">
        <div class="settings-section-title icon-label">
          <ShieldCheck :size="15" :stroke-width="1.8" aria-hidden="true" />
          <h3>{{ $t('偏好') }}</h3>
        </div>
        <p class="settings-section-desc">{{ $t('管理长期表达和求职决策习惯；它不会覆盖个人档案或 Answer Vault。') }}</p>
        <button class="secondary-button settings-section-action" type="button" @click="openPreferences">
          {{ $t('管理偏好') }}
        </button>
      </section>
    </section>
  </div>
</template>
