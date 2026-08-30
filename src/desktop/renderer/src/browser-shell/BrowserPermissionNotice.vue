<script setup lang="ts">
import { ShieldX, X } from "@lucide/vue";
import { computed } from "vue";

import type { BrowserPermissionNotice } from "@desktop/types";
import { translate } from "../i18n/locale";

const props = defineProps<{ notice: BrowserPermissionNotice }>();
defineEmits<{ dismiss: [] }>();

const detail = computed(() => {
  const permission = permissionLabel(props.notice.permission);
  if (!props.notice.origin) return permission;
  try { return `${permission} · ${new URL(props.notice.origin).hostname}`; }
  catch { return permission; }
});

function permissionLabel(permission: string): string {
  const labels: Record<string, string> = {
    camera: "摄像头", geolocation: "位置", microphone: "麦克风",
    notifications: "通知",
  };
  return translate(labels[permission] ?? "站点权限");
}
</script>

<template>
  <section class="permission-notice no-drag" role="status" :title="detail">
    <ShieldX :size="16" :stroke-width="1.8" aria-hidden="true" />
    <div><strong>{{ $t('Coolto 浏览器暂不支持此站点权限') }}</strong><span>{{ detail }}</span></div>
    <button type="button" :aria-label="$t('关闭提示')" :title="$t('关闭提示')"
      @click="$emit('dismiss')"><X :size="15" aria-hidden="true" /></button>
  </section>
</template>

<style scoped>
.permission-notice { flex: none; height: 32px; max-width: 340px; display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px;
  padding: 0 5px 0 9px; border-radius: 8px; background: var(--surface-strong);
  color: var(--text-soft); }
.permission-notice div { min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.permission-notice strong { color: var(--text); font-size: 12px; white-space: nowrap; }
.permission-notice span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.permission-notice button { display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent;
  color: inherit; cursor: pointer; }
.permission-notice button:hover, .permission-notice button:focus-visible {
  background: var(--surface-hover); color: var(--text); }
@media (max-width: 900px) { .permission-notice span { display: none; } }
@media (max-width: 760px) {
  .permission-notice { width: 56px; grid-template-columns: auto auto; padding-inline: 6px; }
  .permission-notice div { position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap; }
}
</style>
