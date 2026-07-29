<script setup lang="ts">
import { Library } from "@lucide/vue";

import { useExperienceLibrary } from "../experiences/use-experience-library";
import ExperienceDetail from "./ExperienceDetail.vue";
import ExperienceLibraryHeader from "./ExperienceLibraryHeader.vue";
import ExperienceTimeline from "./ExperienceTimeline.vue";

defineEmits<{ toggleSidebar: [] }>();
const page = useExperienceLibrary();
</script>

<template>
  <div
    class="tracker-view experience-library-view"
    :class="{ 'detail-open': page.detailOpen.value }"
  >
    <ExperienceLibraryHeader
      v-model:query="page.query.value"
      v-model:category="page.category.value"
      v-model:status="page.status.value"
      :tags="page.tags.value"
      :available-tags="page.availableTags.value"
      :filter-count="page.filterCount.value"
      :loading="page.loading.value"
      @toggle-tag="page.toggleTag"
      @clear-filters="page.clearFilters"
      @refresh="page.load"
      @toggle-sidebar="$emit('toggleSidebar')"
    />

    <div v-if="page.error.value" class="tracker-error-banner" role="alert">
      <span>{{ page.error.value }}</span>
      <button type="button" @click="page.load()">重试</button>
    </div>

    <div
      v-if="page.loading.value && !page.catalog.value.length"
      class="experience-page-state"
    >
      正在读取经历…
    </div>
    <div
      v-else-if="!page.catalog.value.length"
      class="experience-page-state"
    >
      <Library :size="23" aria-hidden="true" />
      <strong>
        {{ page.status.value === 'archived' ? '尚无已归档经历' : '尚无在用经历' }}
      </strong>
      <p>可回到对话导入经历，维护操作将在 E3 接入。</p>
    </div>
    <div v-else class="experience-layout">
      <aside class="experience-list-pane">
        <ExperienceTimeline
          :groups="page.groups.value"
          :selected-id="page.selectedId.value"
          :query="page.query.value"
          empty-label="没有符合当前搜索或筛选条件的经历"
          @select="page.select"
        />
      </aside>
      <section class="experience-detail-pane">
        <div v-if="page.detailLoading.value" class="experience-page-state">
          正在读取经历详情…
        </div>
        <ExperienceDetail
          v-else-if="page.selected.value"
          :experience="page.selected.value"
          @back="page.detailOpen.value = false"
        />
        <div v-else class="experience-page-state">
          {{ page.visible.value.length ? '选择一条经历查看详情' : '调整搜索或筛选条件后重试' }}
        </div>
      </section>
    </div>
  </div>
</template>
