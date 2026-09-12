<script setup lang="ts">
import { X } from "@lucide/vue";
import { onMounted, ref } from "vue";

import type { DesktopApi } from "@desktop/types";
import { translate } from "../i18n/locale";
import { submitPrivacyExport } from "../privacy/privacy-export-form";
const props = defineProps<{
  api: DesktopApi;
  localOnly?: boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement>();
const form = ref<HTMLFormElement>();
const includeCloudAssets = ref(!props.localOnly);
const includeConversations = ref(false);
const includeDrafts = ref(false);
const includeTasks = ref(false);
const busy = ref(false);
const error = ref<string>();
const result = ref<{ fileName: string | null; mode: string | null }>();

onMounted(() => dialog.value?.querySelector<HTMLElement>("input")?.focus());

async function submit(): Promise<void> {
  const values = new FormData(form.value);
  const exportValues = {
    passphrase: values.get("passphrase"),
    confirmation: values.get("confirmation"),
  };
  error.value = undefined;
  result.value = undefined;
  busy.value = true;
  try {
    const exported = await submitPrivacyExport({
      values: exportValues,
      options: {
        includeCloudAssets: includeCloudAssets.value,
        includeConversations: includeConversations.value,
        includeDrafts: includeDrafts.value,
        includeTasks: includeTasks.value,
      },
      reset: () => form.value?.reset(),
      exportData: props.api.privacy.exportData,
    });
    result.value = { fileName: exported.fileName, mode: exported.mode };
  } catch (caught: unknown) {
    error.value = translate(caught instanceof Error ? caught.message : "导出失败，请重试");
  } finally {
    busy.value = false;
  }
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
</script>

<template>
  <div class="dialog-backdrop privacy-data-backdrop" @mousedown.self="!busy && emit('close')">
    <section
      ref="dialog"
      class="dialog-card privacy-data-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-export-title"
      aria-describedby="privacy-export-description"
      @keydown="keydown"
    >
      <header class="privacy-data-dialog-header">
          <h2 id="privacy-export-title">{{ $t(localOnly ? '导出本机数据' : '导出数据') }}</h2>
          <p id="privacy-export-description">{{ $t(localOnly ? '仅导出本机数据，不读取云端快照。' : '云端快照由 Coolto 服务端生成；本机内容会明确标记为仅本机。') }}</p>
        <button class="icon-button" type="button" :disabled="busy" :aria-label="$t('关闭')" @click="emit('close')">
          <X :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <form ref="form" @submit.prevent="submit">
        <fieldset class="privacy-data-options">
          <legend>{{ $t('导出范围') }}</legend>
          <label v-if="!localOnly"><input v-model="includeCloudAssets" type="checkbox" /> {{ $t('云端业务数据（推荐）') }}</label>
          <label><input v-model="includeConversations" type="checkbox" /> {{ $t('本机对话记录') }}</label>
          <label><input v-model="includeDrafts" type="checkbox" /> {{ $t('本机简历草稿与检查点') }}</label>
          <label><input v-model="includeTasks" type="checkbox" /> {{ $t('本机任务摘要') }}</label>
        </fieldset>

        <p class="privacy-data-note">{{ $t('Cookies、Token、密码、浏览器状态、原始文件和绝对路径永远不会导出。') }}</p>
        <label class="privacy-data-field">
          <span>{{ $t('导出密码') }}</span>
          <input name="passphrase" type="password" autocomplete="new-password" :disabled="busy" />
        </label>
        <label class="privacy-data-field">
          <span>{{ $t('再次输入导出密码') }}</span>
          <input name="confirmation" type="password" autocomplete="new-password" :disabled="busy" />
        </label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="privacy-data-actions">
          <button class="secondary-button" type="button" :disabled="busy" @click="emit('close')">{{ $t('取消') }}</button>
          <button class="primary-button" type="submit" :disabled="busy">
            {{ busy ? $t('正在导出…') : $t('导出数据') }}
          </button>
        </div>
      </form>
      <p v-if="result" class="privacy-data-success" role="status">
        {{ result.fileName ? `${$t('已导出到')} ${result.fileName}` : $t('导出已完成') }}
        <span v-if="result.mode === 'offline_stale'">{{ $t('（仅本机，云端快照不可用）') }}</span>
      </p>
    </section>
  </div>
</template>
