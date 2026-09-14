<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import type {
  ApplicationCreateInput,
  DeliveryResumeFile,
  JobRepositoryResume,
  ResumeLibraryEntry,
} from "@desktop/types";
import {
  filterJds,
  filterResumes,
  type JobFilter,
  type RepositoryView,
  type ResumeFilter,
} from "../job-assets/job-repository-filter";
import { useJobRepository } from "../job-assets/use-job-repository";
import type { JobRepositoryNavigationState } from "../job-assets/job-repository-navigation";
import type { TrackerAssetTarget } from "../tracker/tracker-navigation";
import JobRepositoryEmptyState from "./JobRepositoryEmptyState.vue";
import JobRepositoryHeader from "./JobRepositoryHeader.vue";
import JobRepositoryMasterDetail from "./JobRepositoryMasterDetail.vue";
import { deliveryResumeFileEntryId, useDeliveryResumeFiles } from
  "../job-assets/use-delivery-resume-files";

const props = defineProps<{ navigation: JobRepositoryNavigationState }>();
const emit = defineEmits<{
  open: [entry: ResumeLibraryEntry];
  toggleSidebar: [];
  navigate: [state: JobRepositoryNavigationState];
  agent: [action: "generate" | "match", jdId: string, title: string];
  record: [initial: Partial<ApplicationCreateInput>, asset: TrackerAssetTarget];
  tracker: [asset: TrackerAssetTarget];
  applications: [];
  delivery: [file: DeliveryResumeFile];
  resumeLoop: [resume: JobRepositoryResume];
  openChat: [];
}>();

const repository = useJobRepository();
const view = ref<RepositoryView>(props.navigation.view);
const query = ref(props.navigation.query);
const jobFilter = ref<JobFilter>(props.navigation.jobFilter);
const resumeFilter = ref<ResumeFilter>(props.navigation.resumeFilter);
const selectedJdId = ref<string | null>(props.navigation.selectedJdId);
const selectedResumeId = ref<string | null>(props.navigation.selectedResumeId);
const detailOpen = ref(props.navigation.detailOpen);

const filteredJds = computed(() =>
  filterJds(repository.snapshot.value.jds, query.value, jobFilter.value),
);
const filteredResumes = computed(() =>
  filterResumes(repository.snapshot.value.resumes, query.value, resumeFilter.value),
);
const deliveryFiles = useDeliveryResumeFiles({
  snapshot: repository.snapshot, selectedEntryId: selectedResumeId,
  view, query, resumeFilter,
  hasRegularResumeResults: () => filteredResumes.value.length > 0,
  load: repository.load,
  setError: (value) => { repository.error.value = value; },
  closeDetail: () => { detailOpen.value = false; },
  openDetail: () => { detailOpen.value = true; },
});
const selectedJd = computed(() =>
  filteredJds.value.find((jd) => jd.id === selectedJdId.value) ?? filteredJds.value[0],
);
const selectedResume = computed(() => deliveryFiles.selected.value
  ? undefined : filteredResumes.value.find(
    (resume) => resume.entry.entryId === selectedResumeId.value,
  ) ?? filteredResumes.value[0],
);
const selectedListId = computed(() =>
  view.value === "jobs"
    ? selectedJd.value?.id
    : deliveryFiles.selected.value
      ? deliveryResumeFileEntryId(deliveryFiles.selected.value.id)
      : selectedResume.value?.entry.entryId,
);
const allEmpty = computed(() =>
  !repository.snapshot.value.jds.length && !repository.snapshot.value.resumes.length &&
  !repository.snapshot.value.deliveryResumeFiles.length,
);
const viewHasCatalog = computed(() =>
  view.value === "jobs"
    ? repository.snapshot.value.jds.length > 0
    : repository.snapshot.value.resumes.length > 0 ||
      repository.snapshot.value.deliveryResumeFiles.length > 0,
);
const listHasItems = computed(() =>
  view.value === "jobs"
    ? filteredJds.value.length > 0
    : filteredResumes.value.length > 0 || deliveryFiles.filtered.value.length > 0,
);
watch(view, () => { query.value = ""; detailOpen.value = false; });
watch(
  [view, query, jobFilter, resumeFilter, selectedJdId, selectedResumeId, detailOpen],
  () => emit("navigate", {
    view: view.value, query: query.value, jobFilter: jobFilter.value,
    resumeFilter: resumeFilter.value, selectedJdId: selectedJdId.value,
    selectedResumeId: selectedResumeId.value, detailOpen: detailOpen.value,
  }),
);

function clearFilters(): void {
  query.value = "";
  if (view.value === "jobs") jobFilter.value = "";
  else resumeFilter.value = "";
}

function selectJd(id: string): void { selectedJdId.value = id; detailOpen.value = true; }
function selectResume(id: string): void { selectedResumeId.value = id; detailOpen.value = true; }
function selectDeliveryFile(id: string): void { deliveryFiles.select(id); detailOpen.value = true; }

function showResumeFromJd(entryId: string): void {
  view.value = "resumes"; query.value = ""; resumeFilter.value = "";
  selectedResumeId.value = entryId;
  void nextTick(() => { detailOpen.value = true; });
}

function showJdFromResume(jdId: string): void {
  view.value = "jobs"; query.value = ""; jobFilter.value = "";
  selectedJdId.value = jdId;
  void nextTick(() => { detailOpen.value = true; });
}
</script>

<template>
  <div class="tracker-view job-repository-view" :class="{ 'detail-open': detailOpen }">
    <JobRepositoryHeader
      v-model:view="view"
      v-model:query="query"
      v-model:job-filter="jobFilter"
      v-model:resume-filter="resumeFilter"
      :loading="repository.loading.value"
      :delivery-file-count="repository.snapshot.value.deliveryResumeFiles.filter((f) => f.slot !== null).length"
      @refresh="repository.load()"
      @toggle-sidebar="$emit('toggleSidebar')"
      @applications="$emit('applications')"
      @import-delivery="deliveryFiles.importFile"
      @clear-filters="clearFilters"
    />
    <div v-if="repository.error.value" class="tracker-error-banner" role="alert">
      <span>{{ repository.error.value }}</span>
      <button type="button" @click="repository.load()">{{ $t('重试') }}</button>
    </div>
    <div v-if="repository.loading.value && allEmpty" class="repository-page-state">
      {{ $t('正在读取求职资产…') }}
    </div>
    <JobRepositoryEmptyState v-else-if="allEmpty" variant="global" @open-chat="$emit('openChat')" />
    <JobRepositoryEmptyState
      v-else-if="!viewHasCatalog"
      :variant="view"
      @open-chat="$emit('openChat')"
      @import-delivery="deliveryFiles.importFile"
    />
    <JobRepositoryEmptyState
      v-else-if="!listHasItems"
      variant="filter"
      :view="view"
      @clear-filters="clearFilters"
    />
    <JobRepositoryMasterDetail
      v-else
      :view="view"
      :jds="filteredJds"
      :resumes="filteredResumes"
      :all-resumes="repository.snapshot.value.resumes"
      :delivery-files="deliveryFiles.filtered.value"
      :selected-jd="selectedJd"
      :selected-resume="selectedResume"
      :selected-delivery="deliveryFiles.selected.value"
      :selected-list-id="selectedListId"
      :delivery-busy="deliveryFiles.busy.value"
      @select-jd="selectJd"
      @select-resume="selectResume"
      @select-delivery-file="selectDeliveryFile"
      @back="detailOpen = false"
      @agent="(action, id, title) => $emit('agent', action, id, title)"
      @record="(initial, asset) => $emit('record', initial, asset)"
      @tracker="(asset) => $emit('tracker', asset)"
      @open="(entry) => $emit('open', entry)"
      @resume-loop="(resume) => $emit('resumeLoop', resume)"
      @delivery="(file) => $emit('delivery', file)"
      @rename-delivery="deliveryFiles.rename"
      @remove-delivery="deliveryFiles.remove"
      @resume-from-jd="showResumeFromJd"
      @jd-from-resume="showJdFromResume"
    />
  </div>
</template>
