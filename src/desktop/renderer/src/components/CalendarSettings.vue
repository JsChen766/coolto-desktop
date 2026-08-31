<script setup lang="ts">
import { CalendarDays, ExternalLink, LoaderCircle } from "@lucide/vue";
import { onMounted, shallowRef } from "vue";

import type { CalendarStatusView, DesktopApi } from "@desktop/types";

const props = defineProps<{ api: DesktopApi }>();
const status = shallowRef<CalendarStatusView>();
const busy = shallowRef(false);
const error = shallowRef<string>();

onMounted(() => { if (props.api.platform === "darwin") void load(); });

async function load(): Promise<void> {
  error.value = undefined;
  try { status.value = await props.api.calendar.status(); }
  catch (cause) { error.value = message(cause); }
}

async function enable(): Promise<void> {
  busy.value = true;
  error.value = undefined;
  try { status.value = await props.api.calendar.requestAccess("write_only"); }
  catch (cause) { error.value = message(cause); }
  finally { busy.value = false; }
}

async function openSettings(): Promise<void> {
  error.value = undefined;
  try { await props.api.calendar.openSystemSettings(); }
  catch (cause) { error.value = message(cause); }
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
</script>

<template>
  <section v-if="api.platform === 'darwin'" class="settings-section">
    <div class="settings-section-title icon-label">
      <CalendarDays :size="15" :stroke-width="1.8" aria-hidden="true" />
      <h3>{{ $t('macOS Calendar') }}</h3>
    </div>
    <p class="settings-section-desc">
      {{ $t('先申请仅写入权限，把你确认的面试添加到系统日历；改期或取消已有事件时才会请求完整权限。') }}
    </p>
    <p v-if="status" class="settings-section-desc" role="status">
      {{ $t(status.message) }}
    </p>
    <div class="settings-section-actions">
      <button v-if="!status || status.authorization === 'not_determined'"
        class="secondary-button" type="button" :disabled="busy" @click="enable">
        <LoaderCircle v-if="busy" class="spin" :size="14" aria-hidden="true" />
        {{ $t('启用 Calendar 写入') }}
      </button>
      <button v-else class="secondary-button" type="button" @click="openSettings">
        <ExternalLink :size="14" aria-hidden="true" />{{ $t('在系统设置中管理') }}
      </button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>
