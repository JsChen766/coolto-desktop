<template>
  <div class="library-view">
    <div class="library-view-header">
      <h2 class="library-view-title">{{ $t('简历仓库') }}</h2>
      <input
        v-model="keyword"
        class="library-search"
        :placeholder="$t('搜索简历名称或岗位')"
        :aria-label="$t('搜索简历')"
      />
      <select v-model="statusFilter" class="library-filter" :aria-label="$t('状态筛选')">
        <option value="">{{ $t('全部状态') }}</option>
        <option value="active">{{ $t('活跃') }}</option>
        <option value="archived">{{ $t('已归档') }}</option>
        <option value="local_only">{{ $t('仅本机') }}</option>
        <option value="conflict">{{ $t('冲突') }}</option>
      </select>
    </div>

    <div v-if="library.loading.value" class="library-loading">{{ $t('加载中…') }}</div>

    <div v-else-if="library.error.value" class="library-error">
      {{ library.error.value }}
      <button @click="library.load()">{{ $t('重试') }}</button>
    </div>

    <div v-else-if="filtered.length === 0" class="library-empty">
      <p>{{ $t('暂无简历') }}{{ keyword ? $t('（尝试调整搜索词）') : '' }}</p>
    </div>

    <div v-else class="library-grid">
      <ResumeLibraryCard
        v-for="entry in filtered"
        :key="entry.entryId"
        :entry="entry"
        @open="handleOpen"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { ResumeLibraryEntry } from "@desktop/types";
import { useResumeLibrary } from "../library/use-resume-library";
import ResumeLibraryCard from "./ResumeLibraryCard.vue";

const emit = defineEmits<{
  close: [];
  open: [entry: ResumeLibraryEntry];
}>();

const library = useResumeLibrary();
const keyword = ref("");
const statusFilter = ref("");

onMounted(() => library.load());

const filtered = computed(() =>
  library.entries.value.filter((e) => {
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
  }),
);

function handleOpen(entry: ResumeLibraryEntry) {
  emit("open", entry);
}
</script>
