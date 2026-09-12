<script setup lang="ts">
import { ExternalLink, X } from "@lucide/vue";
import { onMounted, ref } from "vue";

import type { DesktopApi } from "@desktop/types";
import MailConnectionsSettings from "./MailConnectionsSettings.vue";
import CalendarSettings from "./CalendarSettings.vue";
import AiNativeAutomationSettings from "./AiNativeAutomationSettings.vue";
import PrivacyDataSection from "./PrivacyDataSection.vue";
import SettingsDialogNav, { type SettingsNavId } from "./SettingsDialogNav.vue";

const props = defineProps<{ api: DesktopApi; conversationId: string }>();
const emit = defineEmits<{
  close: [];
  openProfile: [];
  openPreferences: [];
  openAgentTask: [taskId: string];
}>();
const dialog = ref<HTMLElement>();
const activeNav = ref<SettingsNavId>("profile");
const feedbackError = ref<string>();

const FEEDBACK_FORM_URL =
  "https://gjp785oqywpv.jp.larksuite.com/share/base/form/shrjpRBazL52SDCRqU2gJI8489c";

onMounted(() => {
  dialog.value?.focus();
  dialog.value?.querySelector<HTMLElement>("[data-settings-initial-focus]")?.focus();
});

function dismiss(event?: Event): void {
  event?.stopPropagation();
  emit("close");
}

function selectNav(id: SettingsNavId): void {
  activeNav.value = id;
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
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const nav = event.target instanceof HTMLElement
      ? event.target.closest("[data-settings-nav]")
      : null;
    if (!nav) return;
    const buttons = [...dialog.value?.querySelectorAll<HTMLButtonElement>("[data-settings-nav]") ?? []];
    const index = buttons.findIndex((button) => button === nav);
    if (index < 0) return;
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    if (next < 0 || next >= buttons.length) return;
    const target = buttons[next];
    if (!target) return;
    event.preventDefault();
    target.focus();
    selectNav(target.dataset.settingsNav as SettingsNavId);
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
      data-settings-shell
      tabindex="-1"
      @keydown="keydown"
    >
      <header class="settings-dialog-header">
        <h2 id="settings-dialog-title">{{ $t('设置') }}</h2>
        <button
          class="icon-button"
          type="button"
          :aria-label="$t('关闭设置')"
          @click.stop="dismiss"
        >
          <X :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <div class="settings-dialog-body">
        <SettingsDialogNav :active="activeNav" @select="selectNav" />
        <div class="settings-dialog-pane app-scrollbar" role="region" :aria-label="$t('设置内容')">
          <template v-if="activeNav === 'profile'">
            <h3>{{ $t('个人档案') }}</h3>
            <p class="settings-pane-lead">
              {{ $t('查看和编辑你的联系方式与职业画像，Agent 会使用这些信息生成简历。') }}
            </p>
            <button
              class="secondary-button settings-section-action"
              type="button"
              data-settings-initial-focus
              @click="emit('openProfile')"
            >
              {{ $t('编辑个人信息') }}
            </button>
          </template>

          <template v-else-if="activeNav === 'connections'">
            <h3>{{ $t('连接与日程') }}</h3>
            <p class="settings-pane-lead">
              {{ $t('邮箱直连与系统日历权限；默认可通过浏览器 Webmail 识别邮件。') }}
            </p>
            <div class="settings-pane-block">
              <MailConnectionsSettings
                :api="api"
                :conversation-id="conversationId"
                @started="emit('openAgentTask', $event)"
              />
              <CalendarSettings :api="api" />
            </div>
          </template>

          <template v-else-if="activeNav === 'automation'">
            <h3>{{ $t('自动化') }}</h3>
            <p class="settings-pane-lead">
              {{ $t('让 Agent 定期复盘投递策略，或监控求职邮件中的截止日期与风险。') }}
            </p>
            <AiNativeAutomationSettings
              :api="api"
              :conversation-id="conversationId"
              @started="emit('openAgentTask', $event)"
            />
          </template>

          <template v-else-if="activeNav === 'privacy'">
            <h3>{{ $t('隐私与数据') }}</h3>
            <p class="settings-pane-lead">
              {{ $t('导出、清除本机或删除账号；政策与数据操作均在确认边界内执行。') }}
            </p>
            <PrivacyDataSection :api="api" />
          </template>

          <template v-else-if="activeNav === 'preferences'">
            <h3>{{ $t('偏好') }}</h3>
            <p class="settings-pane-lead">
              {{ $t('管理长期表达和求职决策习惯；它不会覆盖个人档案或 Answer Vault。') }}
            </p>
            <button class="secondary-button settings-section-action" type="button" @click="emit('openPreferences')">
              {{ $t('管理偏好') }}
            </button>
          </template>

          <template v-else>
            <h3>{{ $t('帮助与反馈') }}</h3>
            <p class="settings-pane-lead">
              {{ $t('遇到问题或有功能建议，可以通过反馈表单告诉我们。表单会在系统浏览器中打开，Coolto 不会自动附带你的邮箱、简历或聊天内容。') }}
            </p>
            <button class="secondary-button settings-section-action" type="button" @click="openFeedback">
              <ExternalLink :size="14" :stroke-width="1.8" aria-hidden="true" />
              <span>{{ $t('提交反馈') }}</span>
            </button>
            <p v-if="feedbackError" class="form-error" role="alert">{{ feedbackError }}</p>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>
