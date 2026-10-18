<script setup lang="ts">
import { Download, FileText, ShieldCheck, Trash2, X } from "@lucide/vue";
import { nextTick, ref } from "vue";

import type { DesktopApi } from "@desktop/types";
import type { PrivacyPolicyView } from "../../../../privacy/types.js";
import { BUNDLED_PRIVACY_POLICY, PRIVACY_POLICY_CONTENT } from "../../../../privacy/policy.js";
import { translate } from "../i18n/locale";
import DataExportDialog from "./DataExportDialog.vue";

const props = defineProps<{ api: DesktopApi }>();
const policyOpen = ref(false);
const policyLoading = ref(false);
const policyAvailable = ref(false);
const policyServerAvailable = ref(false);
const serverPolicyVersion = ref<string>();
const serverContentHash = ref<string>();
const serverChangeClass = ref<PrivacyPolicyView["changeClass"]>();
const serverEffectiveAt = ref<string>();
const policyDialog = ref<HTMLElement>();
const policyTrigger = ref<HTMLButtonElement>();
const exportOpen = ref(false);
const confirmingClear = ref(false);
const clearing = ref(false);
const clearResult = ref<"cleared" | "partial_failure" | "blocked">();
const clearError = ref<string>();
const policyError = ref<string>();
async function openPolicy(): Promise<void> {
  policyLoading.value = true;
  policyError.value = undefined;
  policyAvailable.value = false;
  policyServerAvailable.value = false;
  serverPolicyVersion.value = undefined;
  serverContentHash.value = undefined;
  serverChangeClass.value = undefined;
  serverEffectiveAt.value = undefined;
  try {
    const state = await props.api.privacy.getState();
    const policy = state.available ? state.policy : null;
    serverPolicyVersion.value = policy?.policyVersion;
    serverContentHash.value = policy?.contentHash;
    serverChangeClass.value = policy?.changeClass;
    serverEffectiveAt.value = policy?.effectiveAt;
    policyAvailable.value = Boolean(state.available && policy &&
      policy.contentHash === BUNDLED_PRIVACY_POLICY.contentHash &&
      policy.policyVersion === BUNDLED_PRIVACY_POLICY.policyVersion);
    policyServerAvailable.value = Boolean(policy);
    policyOpen.value = true;
    await nextTick();
    policyDialog.value
      ?.querySelector<HTMLElement>("[data-privacy-policy-initial-focus]")
      ?.focus();
  } catch (error: unknown) {
    policyError.value = translate(error instanceof Error ? error.message : "无法读取隐私政策");
  } finally {
    policyLoading.value = false;
  }
}

async function clearDevice(): Promise<void> {
  if (!confirmingClear.value) {
    confirmingClear.value = true;
    return;
  }
  clearing.value = true;
  clearResult.value = undefined;
  clearError.value = undefined;
  try {
    const result = await props.api.data.clearLocal();
    clearResult.value = result.status;
    confirmingClear.value = false;
    if (result.status === "cleared") window.setTimeout(() => window.location.reload(), 900);
  } catch (error: unknown) {
    clearError.value = translate(error instanceof Error ? error.message : "清除本机数据失败");
    clearResult.value = "partial_failure";
    confirmingClear.value = false;
  } finally {
    clearing.value = false;
  }
}


function closePolicy(): void {
  const trigger = policyTrigger.value;
  policyOpen.value = false;
  void nextTick(() => trigger?.focus());
}

function policyKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closePolicy();
    return;
  }
  if (event.key !== "Tab" || !policyDialog.value) return;
  event.stopPropagation();
  const focusable = [...policyDialog.value.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
  )].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
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
  <section class="settings-section privacy-data-section">
    <div class="settings-section-title icon-label">
      <ShieldCheck :size="15" :stroke-width="1.8" aria-hidden="true" />
      <h3>{{ $t('隐私与数据') }}</h3>
    </div>
    <p class="settings-section-desc">
      {{ $t('开源 Desktop 的数据只在本机。你可以查看隐私政策，或清除当前设备上的本地数据。') }}
    </p>
    <p class="settings-section-desc">
      {{ $t('发送给模型前，会使用当前对话、你明确引用或上传的材料，以及完成该任务所需的岗位、经历或简历摘录；不会上传本机绝对路径或登录凭据。') }}
    </p>
    <div class="privacy-data-actions privacy-data-section-actions">
      <button ref="policyTrigger" class="secondary-button" type="button" :disabled="policyLoading" @click="openPolicy">
        <FileText :size="14" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ policyLoading ? $t('正在读取隐私政策…') : $t('查看当前隐私政策') }}</span>
      </button>
      <button
        data-export-trigger
        class="secondary-button"
        type="button"
        @click="exportOpen = true"
      >
        <Download :size="14" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t('导出本机数据') }}</span>
      </button>
    </div>
    <DataExportDialog
      v-if="exportOpen"
      :api="api"
      :local-only="true"
      @close="exportOpen = false"
    />
    <p v-if="policyError" class="form-error" role="alert">{{ policyError }}</p>
    <p v-if="!confirmingClear" class="settings-section-desc">
      {{ $t('清除本机数据会删除本机对话、草稿、任务、连接、浏览器状态和同步数据库；开源 Desktop 无云端资产。系统 Downloads 中的文件不受影响。') }}
    </p>
    <p v-else class="settings-clear-warning" role="alert">
      {{ $t('确认清除本机数据？本机业务数据与本地登录/凭据状态将被删除；开源 Desktop 无云端资产可删。') }}
    </p>
    <div class="settings-section-actions">
      <button v-if="confirmingClear" class="secondary-button" type="button" :disabled="clearing" @click="confirmingClear = false">{{ $t('取消') }}</button>
      <button class="secondary-button danger-text" type="button" :disabled="clearing" @click="clearDevice">
        <Trash2 :size="14" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ clearing ? $t('正在清除…') : confirmingClear ? $t('再次确认清除') : $t('清除本机数据') }}</span>
      </button>
    </div>
    <p v-if="clearResult === 'cleared'" class="settings-clear-success" role="status">{{ $t('本地数据已清除，正在重新加载…') }}</p>
    <p v-if="clearResult === 'partial_failure'" class="form-error" role="alert">{{ $t('本机部分数据未能清除，请重试。开源 Desktop 无云端副本可回灌。') }}</p>
    <p v-if="clearResult === 'blocked'" class="form-error" role="alert">{{ $t('Agent 或浏览器操作正在运行，请完成或停止后再清除。') }}</p>
    <p v-if="clearError" class="form-error" role="alert">{{ clearError }}</p>
    <div v-if="policyOpen" class="dialog-backdrop privacy-data-backdrop" @mousedown.self="closePolicy">
      <section
        ref="policyDialog"
        class="dialog-card privacy-data-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-policy-title"
        aria-describedby="privacy-policy-description"
        @keydown="policyKeydown"
      >
        <header class="privacy-data-dialog-header">
          <div>
            <h2 id="privacy-policy-title">{{ $t('当前隐私政策') }}</h2>
            <p id="privacy-policy-description">
              {{ policyServerAvailable ? $t('服务端返回的政策信息') : $t('服务端隐私政策当前不可用') }}
            </p>
          </div>
          <button
            class="icon-button"
            type="button"
            data-privacy-policy-initial-focus
            :aria-label="$t('关闭')"
            @click="closePolicy"
          >
            <X :size="17" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </header>
        <dl class="privacy-policy-metadata">
          <div>
            <dt>{{ $t('服务端政策版本') }}</dt>
            <dd>{{ serverPolicyVersion || $t('未知') }}</dd>
          </div>
          <div>
            <dt>{{ $t('服务端内容哈希') }}</dt>
            <dd class="privacy-policy-hash">{{ serverContentHash || $t('未知') }}</dd>
          </div>
          <div>
            <dt>{{ $t('服务端变更类型') }}</dt>
            <dd>
              <span v-if="serverChangeClass === 'major'">{{ $t('重大变更') }}</span>
              <span v-else-if="serverChangeClass === 'minor'">{{ $t('一般变更') }}</span>
              <span v-else>{{ $t('未知') }}</span>
              <code v-if="serverChangeClass">({{ serverChangeClass }})</code>
            </dd>
          </div>
          <div>
            <dt>{{ $t('服务端生效时间') }}</dt>
            <dd>{{ serverEffectiveAt || $t('时间未知') }}</dd>
          </div>
        </dl>
        <p v-if="!policyServerAvailable" class="privacy-data-warning" role="alert">
          {{ $t('当前无法读取服务端隐私政策，未展示未核验正文。') }}
        </p>
        <p v-else-if="policyAvailable" class="privacy-data-status" role="status">
          {{ $t('本地正文与服务端内容一致。') }}
        </p>
        <p v-else class="privacy-data-warning" role="alert">
          {{ $t('服务端政策与本地正文不一致，当前不会展示未核验正文。') }}
        </p>
        <p v-if="policyAvailable" class="privacy-policy-content">
          <span v-for="line in PRIVACY_POLICY_CONTENT" :key="line">{{ $t(line) }}</span>
        </p>
        <div class="privacy-data-actions">
          <button class="secondary-button" type="button" @click="closePolicy">{{ $t('关闭') }}</button>
        </div>
      </section>
    </div>
  </section>
</template>
