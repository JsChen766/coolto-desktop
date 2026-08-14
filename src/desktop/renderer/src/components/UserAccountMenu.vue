<script setup lang="ts">
import {
  Ellipsis,
  IdCard,
  Languages,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  Zap,
} from "@lucide/vue";
import { computed, ref } from "vue";

import type { AppUpdateState, DesktopUser } from "@desktop/types";
import {
  appLocale,
  toggleLocale,
  translate,
  translateFormat,
} from "../i18n/locale";

const props = defineProps<{
  user: DesktopUser;
  dark: boolean;
  open: boolean;
  updateState: AppUpdateState;
  updateChecking: boolean;
  updateUpToDate: boolean;
  credits?: number | undefined;
}>();

const emit = defineEmits<{
  toggle: [];
  close: [];
  toggleTheme: [];
  openProfile: [trigger: HTMLElement];
  openSettings: [];
  openCredits: [];
  checkUpdate: [];
  installUpdate: [];
  logout: [];
}>();

const userMenuTrigger = ref<HTMLButtonElement>();

const updateRowLabel = computed(() => {
  const phase = props.updateState.phase;
  if (props.updateChecking) return translate("正在检查更新…");
  if (phase === "installing") return translate("正在更新…");
  if (phase === "downloaded") return translate("更新并安装");
  if (phase === "downloading" || phase === "available") {
    return translateFormat("发现新版本 v{version}，正在下载… {percent}%", {
      version: props.updateState.updateVersion ?? "?",
      percent: props.updateState.percent ?? 0,
    });
  }
  if (phase === "error") {
    return props.updateState.errorStage === "install"
      ? translate("更新失败，点击重试")
      : translate("检查更新失败，点击重试");
  }
  if (props.updateUpToDate) return translate("已是最新版本");
  return translateFormat("检查更新 v{version}", {
    version: props.updateState.currentVersion,
  });
});

function openProfile(): void {
  if (!userMenuTrigger.value) return;
  emitClose();
  emit("openProfile", userMenuTrigger.value);
}

function emitClose(): void {
  emit("close");
}
</script>

<template>
  <div class="user-row">
    <div class="user-avatar" aria-hidden="true">
      {{ user.email.slice(0, 1).toUpperCase() }}
    </div>
    <div class="user-copy">
      <span class="user-email">{{ user.email }}</span>
      <span class="user-status-row">
        <span>{{ $t('已登录') }}</span>
        <button
          v-if="credits !== undefined"
          class="user-credits-chip"
          type="button"
          :title="$t('Credit 与套餐')"
          @click="emitClose(); $emit('openCredits')"
        >
          <Zap :size="11" :stroke-width="2" aria-hidden="true" />
          <span>{{ credits }}</span>
        </button>
      </span>
    </div>
    <button
      class="user-menu-trigger"
      ref="userMenuTrigger"
      type="button"
      :aria-label="$t('账户菜单')"
      :title="$t('账户菜单')"
      @click.stop="$emit('toggle')"
    >
      <Ellipsis :size="17" :stroke-width="1.8" aria-hidden="true" />
      <span
        v-if="updateState.phase === 'downloaded'"
        class="user-menu-badge"
        aria-hidden="true"
      />
    </button>
    <div v-if="open" class="popover user-menu" @click.stop>
      <button class="menu-row icon-label" type="button" @click="$emit('toggleTheme')">
        <Sun v-if="dark" :size="16" :stroke-width="1.8" aria-hidden="true" />
        <Moon v-else :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ dark ? $t('切换浅色模式') : $t('切换深色模式') }}</span>
      </button>
      <button class="menu-row icon-label" type="button" @click="toggleLocale(); emitClose()">
        <Languages :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ appLocale === "zh-CN" ? $t('切换到英文') : 'Switch to Chinese' }}</span>
      </button>
      <button class="menu-row icon-label" type="button" @click="openProfile">
        <IdCard :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t('个人信息') }}</span>
      </button>
      <button class="menu-row icon-label" type="button" @click="emitClose(); $emit('openSettings')">
        <Settings :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t('设置') }}</span>
      </button>
      <button class="menu-row icon-label" type="button" @click="emitClose(); $emit('openCredits')">
        <Zap :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t('Credit 与套餐') }}</span>
      </button>
      <button
        class="menu-row icon-label update-menu-row"
        type="button"
        :disabled="updateChecking || updateState.phase === 'installing'"
        :title="updateRowLabel"
        @click="
          updateState.phase === 'downloaded'
            ? $emit('installUpdate')
            : $emit('checkUpdate')
        "
      >
        <RefreshCw
          :size="16"
          :stroke-width="1.8"
          :class="{ spin: updateChecking || updateState.phase === 'installing' }"
          aria-hidden="true"
        />
        <span>{{ updateRowLabel }}</span>
      </button>
      <div class="menu-divider" />
      <button class="menu-row icon-label" type="button" @click="$emit('logout')">
        <LogOut :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t('退出登录') }}</span>
      </button>
    </div>
  </div>
</template>
