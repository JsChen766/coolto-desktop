<script setup lang="ts">
import { X } from "@lucide/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";

import type { DesktopApi, PrivacyDeletionState } from "@desktop/types";
import { translate } from "../i18n/locale";

const props = defineProps<{
  api: DesktopApi;
  standalone?: boolean;
}>();
const emit = defineEmits<{ close: []; logout: [] }>();
const dialog = ref<HTMLElement>();
const accountEmail = ref("");
const confirmation = ref("");
const state = ref<PrivacyDeletionState>(idleState());
const busy = ref(false);
const loading = ref(true);
const error = ref<string>();
let unsubscribe: (() => void) | undefined;

onMounted(async () => {
  dialog.value?.querySelector<HTMLElement>("input")?.focus();
  unsubscribe = props.api.privacy.onDeletionStateChange((next) => { state.value = next; });
  try {
    const user = await props.api.auth.getCurrentUser();
    accountEmail.value = user?.email ?? "";
    state.value = await props.api.privacy.getDeletionState();
  } catch (caught: unknown) {
    error.value = translate(caught instanceof Error ? caught.message : "无法读取删除状态");
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => unsubscribe?.());

async function start(): Promise<void> {
  error.value = undefined;
  if (confirmation.value !== "DELETE MY ACCOUNT") {
    error.value = "请输入 DELETE MY ACCOUNT 以确认删除";
    return;
  }
  if (!accountEmail.value.trim()) {
    error.value = "请输入当前登录账号邮箱";
    return;
  }
  busy.value = true;
  try {
    state.value = await props.api.privacy.startDeletion({
      accountEmail: accountEmail.value.trim(),
      confirmation: confirmation.value,
    });
    confirmation.value = "";
  } catch (caught: unknown) {
    error.value = translate(caught instanceof Error ? caught.message : "删除请求失败，请重试");
  } finally {
    busy.value = false;
  }
}

async function retry(): Promise<void> {
  await runAction(() => props.api.privacy.retryDeletion());
}
async function runAction(action: () => Promise<PrivacyDeletionState>): Promise<void> {
  error.value = undefined;
  busy.value = true;
  try { state.value = await action(); }
  catch (caught: unknown) { error.value = translate(caught instanceof Error ? caught.message : "删除恢复失败，请重试"); }
  finally { busy.value = false; }
}

function statusLabel(status: PrivacyDeletionState["status"]): string {
  return ({
    idle: "未开始", awaiting_control_ack: "等待确认", pending_deletion: "已确认，等待处理",
    processing: "正在删除", partial_failure: "部分失败", completed: "已完成", failed: "处理失败",
  })[status];
}
function stepName(name: PrivacyDeletionState["steps"][number]["name"]): string {
  return ({
    cloud_assets: "云端业务数据",
    sync_history: "同步历史",
    identity: "账号与登录凭证",
    third_party_boundary: "第三方数据范围",
  })[name];
}
function stepStatus(status: PrivacyDeletionState["steps"][number]["status"]): string {
  return ({
    pending: "待处理",
    completed: "已完成",
    failed: "失败",
    not_applicable: "不适用",
  })[status];
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (!busy.value) emit("close");
    return;
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
  )];
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
function idleState(): PrivacyDeletionState {
  return { status: "idle", requestId: null, retryable: false, steps: [], thirdPartyDataUnaffected: true, message: null, updatedAt: null, completedAt: null };
}
</script>

<template>
  <div class="dialog-backdrop privacy-data-backdrop" @mousedown.self="!busy && emit('close')">
    <section ref="dialog" class="dialog-card privacy-data-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-warning" @keydown="keydown">
      <header class="privacy-data-dialog-header">
        <div>
          <h2 id="delete-account-title">{{ $t('删除账号及云端数据') }}</h2>
          <p>{{ $t('这项操作不可逆。删除完成后，Coolto 不提供账号恢复。') }}</p>
        </div>
        <button class="icon-button" type="button" :disabled="busy" :aria-label="$t('关闭')" @click="emit('close')">
          <X :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <p id="delete-account-warning" class="privacy-data-warning" role="note">{{ $t('Coolto 只能删除自己拥有的账号、云端业务数据与本机数据；雇主、招聘网站、邮箱/日历 Provider、系统备份和已经提交到外部的数据不会被删除。') }}</p>
      <p class="privacy-data-status" role="status">{{ $t('当前状态') }}：{{ $t(statusLabel(state.status)) }}</p>
      <p v-if="state.message" class="privacy-data-note">{{ state.message }}</p>
      <p v-if="loading" class="privacy-data-note">{{ $t('正在加载…') }}</p>

      <template v-if="state.status === 'idle' || state.status === 'awaiting_control_ack'">
        <label class="privacy-data-field">
          <span>{{ $t('输入当前账号邮箱') }}</span>
          <input v-model="accountEmail" type="email" autocomplete="username" :disabled="busy || loading" />
        </label>
        <label class="privacy-data-field">
          <span>{{ $t('输入 DELETE MY ACCOUNT') }}</span>
          <input v-model="confirmation" type="text" autocomplete="off" :disabled="busy || loading" />
        </label>
      </template>

      <ul v-if="state.steps.length" class="privacy-data-steps">
        <li v-for="step in state.steps" :key="step.name">
          <span>{{ $t(stepName(step.name)) }}</span><strong>{{ $t(stepStatus(step.status)) }}</strong>
          <small v-if="step.errorCode">{{ $t('处理失败') }}</small>
        </li>
      </ul>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <div class="privacy-data-actions">
        <button v-if="standalone" class="privacy-link-button" type="button" :disabled="busy" @click="emit('logout')">{{ $t('退出登录') }}</button>
        <button class="secondary-button" type="button" :disabled="busy" @click="emit('close')">{{ $t('取消') }}</button>
        <button v-if="state.retryable && state.status !== 'idle'" class="secondary-button" type="button" :disabled="busy" @click="retry">{{ state.status === 'awaiting_control_ack' ? $t('继续确认删除') : $t('重试') }}</button>
        <button v-if="state.status === 'idle' || (state.status === 'awaiting_control_ack' && !state.retryable)" class="primary-button danger-button" type="button" :disabled="busy || loading" @click="start">{{ busy ? $t('正在处理…') : $t('确认删除账号') }}</button>
        <button v-else-if="state.status === 'completed'" class="primary-button" type="button" :disabled="busy" @click="emit('close')">{{ $t('已完成') }}</button>
      </div>
    </section>
  </div>
</template>
