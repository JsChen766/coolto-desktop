<template>
  <div class="library-view">
    <div class="library-view-header">
      <h2 class="library-view-title">简历仓库</h2>
      <input
        v-model="keyword"
        class="library-search"
        placeholder="搜索简历名称或岗位"
        aria-label="搜索简历"
      />
      <select v-model="statusFilter" class="library-filter" aria-label="状态筛选">
        <option value="">全部状态</option>
        <option value="active">活跃</option>
        <option value="archived">已归档</option>
        <option value="local_only">仅本机</option>
        <option value="conflict">冲突</option>
      </select>
    </div>

    <div v-if="library.loading.value" class="library-loading">加载中…</div>

    <div v-else-if="library.error.value" class="library-error">
      {{ library.error.value }}
      <button @click="library.load()">重试</button>
    </div>

    <div v-else-if="filtered.length === 0" class="library-empty">
      <p>暂无简历{{ keyword ? '（尝试调整搜索词）' : '' }}</p>
    </div>

    <ul v-else class="library-list" role="list">
      <li v-for="entry in filtered" :key="entry.entryId">
        <ResumeLibraryRow
          :entry="entry"
          @open="handleOpen"
          @rename="library.rename"
          @archive="library.archive"
          @delete="library.deleteDraft"
          @history="handleHistory"
        />
        <SyncConflictModal
          v-if="conflictEntry?.entryId === entry.entryId"
          :title="entry.displayTitle"
          @reload="handleReload(entry)"
          @saveAsNew="handleSaveAsNew(entry)"
          @overwrite="handleOverwrite(entry)"
          @cancel="conflictEntry = null"
        />
      </li>
    </ul>

    <ResumeCheckpointList
      v-if="library.checkpoints.value.length > 0 && library.checkpointDraftId.value"
      :checkpoints="library.checkpoints.value"
      @close="library.clearCheckpoints()"
      @restore="handleRestore"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { ResumeLibraryEntry } from "../../../../../resume/library/types";
import { useResumeLibrary } from "../library/use-resume-library";
import ResumeLibraryRow from "./ResumeLibraryRow.vue";
import ResumeCheckpointList from "./ResumeCheckpointList.vue";
import SyncConflictModal from "./SyncConflictModal.vue";

const emit = defineEmits<{
  close: [];
  open: [entry: ResumeLibraryEntry];
}>();

const library = useResumeLibrary();
const keyword = ref("");
const statusFilter = ref("");
const conflictEntry = ref<ResumeLibraryEntry | null>(null);

onMounted(() => library.load());

const filtered = computed(() => {
  return library.entries.value.filter((e) => {
    if (keyword.value) {
      const kw = keyword.value.toLowerCase();
      const match =
        e.displayTitle.toLowerCase().includes(kw) ||
        (e.cloud?.targetRole ?? "").toLowerCase().includes(kw);
      if (!match) return false;
    }
    if (statusFilter.value) {
      if (statusFilter.value === "archived") return e.cloud?.status === "archived";
      if (statusFilter.value === "active") return e.cloud?.status === "active";
      if (statusFilter.value === "local_only") return e.syncStatus === "local_only";
      if (statusFilter.value === "conflict") return e.syncStatus === "conflict";
    }
    return true;
  });
});

function handleOpen(entry: ResumeLibraryEntry) {
  if (entry.syncStatus === "conflict") {
    conflictEntry.value = entry;
    return;
  }
  emit("open", entry);
}

async function handleHistory(artifactId: string) {
  await library.loadCheckpoints(artifactId);
}

async function handleRestore(checkpointId: string) {
  const artifactId = library.checkpointDraftId.value;
  if (!artifactId) return;
  await library.restoreCheckpoint(artifactId, checkpointId);
}

function handleReload(entry: ResumeLibraryEntry) {
  conflictEntry.value = null;
  emit("open", { ...entry, syncStatus: "cloud_only" });
}

function handleSaveAsNew(_entry: ResumeLibraryEntry) {
  conflictEntry.value = null;
  // Navigates to the chat to generate a new resume; handled by parent
  alert("请在对话中使用「保存为新简历」操作。");
}

function handleOverwrite(entry: ResumeLibraryEntry) {
  conflictEntry.value = null;
  emit("open", entry);
}
</script>
