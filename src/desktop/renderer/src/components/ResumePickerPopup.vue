<template>
  <div class="resume-picker-backdrop" @click.self="$emit('close')">
    <div class="resume-picker">
      <p class="resume-picker-title">{{ $t('选择简历') }}</p>
      <div v-if="loading" class="resume-picker-loading">{{ $t('加载中…') }}</div>
      <ul v-else class="resume-picker-list" role="listbox">
        <li
          v-for="entry in entries"
          :key="entry.entryId"
          class="resume-picker-item"
          role="option"
          tabindex="0"
          @click="pick(entry)"
          @keydown.enter="pick(entry)"
        >
          <span class="resume-picker-item-title">{{ entry.displayTitle }}</span>
          <span class="resume-picker-item-meta">{{ statusLabel(entry) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { ResumeChatReference } from "@desktop/types";
import type { ResumeLibraryEntry } from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";
import { translate } from "../i18n/locale";

const emit = defineEmits<{
  select: [reference: ResumeChatReference];
  close: [];
}>();

const entries = ref<ResumeLibraryEntry[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    entries.value = await desktopApi.library.list();
  } finally {
    loading.value = false;
  }
});

function statusLabel(entry: ResumeLibraryEntry): string {
  const s = entry.syncStatus;
  if (s === "synced") return translate("已同步");
  if (s === "cloud_only") return translate("仅云端");
  if (s === "local_only") return translate("仅本机");
  if (s === "local_changes") return translate("有本地修改");
  if (s === "cloud_changes") return translate("云端已更新");
  if (s === "conflict") return translate("冲突");
  return "";
}

function pick(entry: ResumeLibraryEntry): void {
  const local = entry.local;
  const cloud = entry.cloud;
  const artifactId = local?.artifactId ?? `cloud:${cloud?.resumeId ?? entry.entryId}`;
  const targetId = local?.artifactId ?? cloud?.resumeId ?? entry.entryId;
  emit("select", {
    artifactId,
    targetType: "resume",
    targetId,
    label: entry.displayTitle,
    source: local ? "local" : "cloud",
    ...(cloud
      ? { resumeId: cloud.resumeId, contentHash: cloud.contentHash }
      : {}),
    ...(!local ? { operationMode: "read_only" as const } : {}),
  });
}
</script>
