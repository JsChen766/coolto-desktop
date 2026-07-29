<script setup lang="ts">
import { Library } from "@lucide/vue";
import type { ExperienceImportFocus } from "../experiences/experience-import-focus";
import { useExperienceLibraryController } from "../experiences/use-experience-library-controller";
import ExperienceDetail from "./ExperienceDetail.vue";
import ExperienceEditor from "./ExperienceEditor.vue";
import ExperienceImportFocusBar from "./ExperienceImportFocusBar.vue";
import ExperienceLibraryHeader from "./ExperienceLibraryHeader.vue";
import ExperienceProposalDialog from "./ExperienceProposalDialog.vue";
import ExperienceSyncIssueDialog from "./ExperienceSyncIssueDialog.vue";
import ExperienceTimeline from "./ExperienceTimeline.vue";
import ExperienceUnsavedDialog from "./ExperienceUnsavedDialog.vue";

const props = defineProps<{
  importFocus: ExperienceImportFocus | undefined;
}>();
const emit = defineEmits<{
  clearImportFocus: [];
  returnImport: [];
  toggleSidebar: [];
}>();
const {
  clearImportFocus,
  editExperience,
  focusPosition,
  leaveEditor,
  maintenance,
  newExperience,
  page,
  prepareDetailAction,
  refresh,
  selectExperience,
  updateFilter,
} = useExperienceLibraryController(
  () => props.importFocus,
  () => emit("clearImportFocus"),
);

defineExpose({ confirmLeave: maintenance.confirmLeave });
</script>

<template>
  <div
    class="tracker-view experience-library-view"
    :class="{ 'detail-open': page.detailOpen.value }"
  >
    <ExperienceLibraryHeader
      :query="page.query.value"
      :category="page.category.value"
      :status="page.status.value"
      :tags="page.tags.value"
      :available-tags="page.availableTags.value"
      :filter-count="page.filterCount.value"
      :loading="page.loading.value"
      @update:query="updateFilter(() => { page.query.value = $event })"
      @update:category="updateFilter(() => { page.category.value = $event })"
      @update:status="updateFilter(() => { page.status.value = $event })"
      @toggle-tag="updateFilter(() => page.toggleTag($event))"
      @clear-filters="updateFilter(page.clearFilters)"
      @refresh="refresh"
      @new-experience="newExperience"
      @toggle-sidebar="$emit('toggleSidebar')"
    />

    <ExperienceImportFocusBar
      v-if="importFocus"
      :count="page.focusedIds.value.length"
      :position="focusPosition"
      :missing-count="page.focusMissingCount.value"
      :loading="page.focusLoading.value"
      @back="$emit('returnImport')"
      @clear="clearImportFocus"
      @move="page.moveImportedFocus"
    />

    <div
      v-if="page.error.value || (maintenance.error.value && !maintenance.proposal.value && !maintenance.syncIssue.value && !maintenance.editorMode.value)"
      class="tracker-error-banner"
      role="alert"
    >
      <span>{{ page.error.value || maintenance.error.value }}</span>
      <button
        v-if="page.error.value"
        type="button"
        @click="page.load()"
      >
        重试
      </button>
      <button
        v-else
        type="button"
        @click="maintenance.error.value = undefined"
      >
        关闭
      </button>
    </div>

    <div
      v-if="page.loading.value && !page.catalog.value.length"
      class="experience-page-state"
    >
      正在读取经历…
    </div>
    <div
      v-else-if="!page.catalog.value.length && !maintenance.editorMode.value"
      class="experience-page-state"
    >
      <Library :size="23" aria-hidden="true" />
      <strong>
        {{ page.status.value === 'archived' ? '尚无已归档经历' : '尚无在用经历' }}
      </strong>
      <p>可以新建经历，也可以回到对话从现有简历导入。</p>
    </div>
    <div v-else class="experience-layout">
      <aside class="experience-list-pane">
        <ExperienceTimeline
          :groups="page.groups.value"
          :selected-id="page.selectedId.value"
          :highlighted-ids="page.focusedIds.value"
          :query="page.query.value"
          empty-label="没有符合当前搜索或筛选条件的经历"
          @select="selectExperience"
        />
      </aside>
      <section class="experience-detail-pane">
        <ExperienceEditor
          v-if="maintenance.editorMode.value && maintenance.initialDraft.value"
          :key="`${maintenance.editorMode.value}:${page.selectedId.value || 'new'}`"
          :mode="maintenance.editorMode.value"
          :initial="maintenance.initialDraft.value"
          :busy="maintenance.busy.value"
          :error="maintenance.error.value"
          @dirty="maintenance.dirty.value = $event"
          @cancel="maintenance.requestCancelEditor"
          @review="maintenance.review"
        />
        <div v-else-if="page.detailLoading.value" class="experience-page-state">
          正在读取经历详情…
        </div>
        <ExperienceDetail
          v-else-if="page.selected.value"
          :experience="page.selected.value"
          :busy="maintenance.busy.value"
          @back="leaveEditor(() => { page.detailOpen.value = false })"
          @edit="editExperience"
          @action="prepareDetailAction"
          @resolve-sync="maintenance.openSyncIssue(page.selected.value!.id)"
        />
        <div v-else class="experience-page-state">
          {{ page.visible.value.length ? '选择一条经历查看详情' : '调整搜索或筛选条件后重试' }}
        </div>
      </section>
    </div>

    <ExperienceProposalDialog
      v-if="maintenance.proposal.value"
      :proposal="maintenance.proposal.value"
      :busy="maintenance.busy.value"
      :error="maintenance.error.value"
      @back="maintenance.closeProposal"
      @close="maintenance.closeProposal"
      @confirm="maintenance.executeProposal"
    />
    <ExperienceSyncIssueDialog
      v-if="maintenance.syncIssue.value"
      :issue="maintenance.syncIssue.value"
      :busy="maintenance.busy.value"
      :error="maintenance.error.value"
      @close="maintenance.syncIssue.value = undefined"
      @action="maintenance.prepareSyncAction"
    />
    <ExperienceUnsavedDialog
      v-if="maintenance.unsavedOpen.value"
      @stay="maintenance.answerLeave(false)"
      @discard="maintenance.answerLeave(true)"
    />
  </div>
</template>
