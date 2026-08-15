<script setup lang="ts">
import { computed } from "vue";
import { Download, ShieldAlert } from "@lucide/vue";

import type { AppUpdateState } from "@desktop/types";

const props = defineProps<{
  state: AppUpdateState;
}>();

const show = computed(() => {
  const phase = props.state.phase;
  return (
    phase === "available" ||
    phase === "downloading" ||
    phase === "downloaded" ||
    (phase === "error" && Boolean(props.state.updateVersion))
  );
});
defineEmits<{
  install: [];
  retry: [];
}>();
</script>

<template>
  <div
    v-if="show"
    class="forced-update-overlay"
    role="alertdialog"
    aria-modal="true"
  >
    <div class="forced-update-card">
      <div class="forced-update-icon">
        <Download v-if="state.phase !== 'error'" :size="26" :stroke-width="1.7" aria-hidden="true" />
        <ShieldAlert v-else :size="26" :stroke-width="1.7" aria-hidden="true" />
      </div>

      <template v-if="state.phase !== 'error'">
        <h1>{{ $t('检测到新版本') }}</h1>
        <p class="forced-update-version">
          {{
            state.updateVersion
              ? $tf('最新版本 v{version}，请更新后继续使用。', { version: state.updateVersion })
              : $t('请更新后继续使用。')
          }}
        </p>

        <div v-if="state.phase === 'downloading'" class="forced-update-progress" aria-label="下载进度">
          <div class="forced-update-progress-track">
            <div class="forced-update-progress-fill" :style="{ width: `${state.percent ?? 0}%` }" />
          </div>
          <span>{{ $tf('正在下载更新 {percent}%', { percent: state.percent ?? 0 }) }}</span>
        </div>
        <p v-else-if="state.phase === 'available'" class="forced-update-hint">
          {{ $t('正在准备更新…') }}
        </p>

        <button
          class="primary-button forced-update-action"
          type="button"
          :disabled="state.phase !== 'downloaded'"
          @click="$emit('install')"
        >
          {{ state.phase === 'downloaded' ? $t('更新') : $t('请稍候…') }}
        </button>
      </template>

      <template v-else>
        <h1>{{ $t('更新检查失败') }}</h1>
        <p class="forced-update-version">{{ state.message ?? $t('无法连接更新服务。') }}</p>
        <button class="primary-button forced-update-action" type="button" @click="$emit('retry')">
          {{ $t('重试') }}
        </button>
      </template>

      <p class="forced-update-note">{{ $t('为正常使用，请先完成更新。') }}</p>
    </div>
  </div>
</template>
