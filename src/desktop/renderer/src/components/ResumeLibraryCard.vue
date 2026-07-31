<template>
  <div class="library-card" role="button" tabindex="0" @click="$emit('open', entry)" @keydown.enter="$emit('open', entry)">
    <div class="library-card-thumb" aria-hidden="true">
      <div class="thumb-header-bar" />
      <div class="thumb-lines">
        <div class="thumb-line w-80" />
        <div class="thumb-line w-60" />
        <div class="thumb-line w-90" />
        <div class="thumb-line w-50" />
        <div class="thumb-line w-75" />
        <div class="thumb-line w-65" />
        <div class="thumb-line w-40" />
        <div class="thumb-line w-80" />
        <div class="thumb-line w-55" />
      </div>
    </div>
    <div class="library-card-body">
      <p class="library-card-title">{{ entry.displayTitle }}</p>
      <p class="library-card-meta">
        <span :class="['library-card-dot', entry.syncStatus]" />
        {{ statusLabel }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ResumeLibraryEntry } from "@desktop/types";
import { translate } from "../i18n/locale";

const props = defineProps<{ entry: ResumeLibraryEntry }>();
defineEmits<{ open: [entry: ResumeLibraryEntry] }>();

const statusLabel = computed(() => {
  const s = props.entry.syncStatus;
  if (s === "synced") return translate("云端 · 已同步");
  if (s === "cloud_only") return translate("仅云端");
  if (s === "local_only") return translate("仅本机");
  if (s === "local_changes") return translate("有本地修改");
  if (s === "cloud_changes") return translate("云端已更新");
  if (s === "conflict") return translate("冲突");
  return "";
});
</script>
