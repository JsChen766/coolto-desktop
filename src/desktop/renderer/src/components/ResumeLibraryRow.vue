<template>
  <div class="library-row" :class="{ archived: isArchived }">
    <div class="library-row-main" @click="$emit('open', entry)">
      <span class="library-row-title">{{ entry.displayTitle }}</span>
      <span class="library-row-role" v-if="entry.cloud?.targetRole">
        {{ entry.cloud.targetRole }}
      </span>
    </div>

    <div class="library-row-meta">
      <span class="library-sync-badge" :class="entry.syncStatus">
        {{ syncLabel }}
      </span>
      <span class="library-row-time">{{ updatedAt }}</span>
    </div>

    <div class="library-row-actions">
      <button
        class="library-menu-btn"
        :aria-label="$t('更多操作')"
        @click.stop="menuOpen = !menuOpen"
      >⋯</button>

      <div v-if="menuOpen" class="library-menu-popup" @click.stop>
        <button v-if="canRename" @click="startRename">{{ $t('重命名') }}</button>
        <button v-if="canArchive" @click="emit('archive', entry.cloud!.resumeId, true)">{{ $t('归档') }}</button>
        <button v-if="canUnarchive" @click="emit('archive', entry.cloud!.resumeId, false)">{{ $t('恢复归档') }}</button>
        <button v-if="canHistory" @click="emit('history', entry.local!.artifactId)">{{ $t('本地历史') }}</button>
        <hr v-if="canDelete" />
        <button v-if="canDelete" class="destructive" @click="confirmDelete">
          {{ $t('删除本地草稿') }}
        </button>
      </div>
    </div>

    <div v-if="renaming" class="library-rename-form" @click.stop>
      <input
        ref="renameInput"
        v-model="renameTitle"
        class="library-rename-input"
        @keydown.enter="submitRename"
        @keydown.escape="renaming = false"
      />
      <button @click="submitRename">{{ $t('确认') }}</button>
      <button @click="renaming = false">{{ $t('取消') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import type { ResumeLibraryEntry } from "@desktop/types";
import { localeCode, translate, translateFormat } from "../i18n/locale";

const props = defineProps<{ entry: ResumeLibraryEntry }>();
const emit = defineEmits<{
  open: [entry: ResumeLibraryEntry];
  rename: [resumeId: string, title: string];
  archive: [resumeId: string, archive: boolean];
  delete: [artifactId: string];
  history: [artifactId: string];
}>();

const menuOpen = ref(false);
const renaming = ref(false);
const renameTitle = ref(props.entry.displayTitle);
const renameInput = ref<HTMLInputElement | null>(null);

const ops = computed(() => new Set(props.entry.availableOperations));
const canRename = computed(() => ops.value.has("rename"));
const canArchive = computed(() => ops.value.has("archive"));
const canUnarchive = computed(() => ops.value.has("unarchive"));
const canDelete = computed(() => ops.value.has("delete_local_draft"));
const canHistory = computed(() => ops.value.has("restore_checkpoint"));
const isArchived = computed(() => props.entry.cloud?.status === "archived");

const syncLabel = computed(() => {
  const map: Record<string, string> = {
    cloud_only: "仅云端",
    local_only: "仅本机",
    synced: "已同步",
    local_changes: "有本地修改",
    cloud_changes: "云端已更新",
    conflict: "冲突",
  };
  return translate(map[props.entry.syncStatus] ?? props.entry.syncStatus);
});

const updatedAt = computed(() => {
  const date = props.entry.cloud?.updatedAt ?? props.entry.local?.updatedAt;
  return date ? new Date(date).toLocaleDateString(localeCode()) : "";
});

async function startRename() {
  menuOpen.value = false;
  renameTitle.value = props.entry.displayTitle;
  renaming.value = true;
  await nextTick();
  renameInput.value?.focus();
}

function submitRename() {
  const t = renameTitle.value.trim();
  if (t && t !== props.entry.displayTitle && props.entry.cloud) {
    emit("rename", props.entry.cloud.resumeId, t);
  }
  renaming.value = false;
}

function confirmDelete() {
  menuOpen.value = false;
  if (props.entry.local && confirm(translateFormat(
    "删除本地草稿“{title}”？此操作不影响云端简历。",
    { title: props.entry.displayTitle },
  ))) {
    emit("delete", props.entry.local.artifactId);
  }
}
</script>
