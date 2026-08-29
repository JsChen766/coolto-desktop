<script setup lang="ts">
import { BriefcaseBusiness } from "@lucide/vue";
import { computed, nextTick, ref, watch } from "vue";

import type {
  ApplicationCreateInput,
  DeliveryResumeFile,
  JobRepositoryJd,
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
import JobRepositoryAssetList from "./JobRepositoryAssetList.vue";
import JobRepositoryHeader from "./JobRepositoryHeader.vue";
import JobRepositoryJdDetail from "./JobRepositoryJdDetail.vue";
import JobRepositoryResumeDetail from "./JobRepositoryResumeDetail.vue";
import DeliveryResumeFileDetail from "./DeliveryResumeFileDetail.vue";
import {
  deliveryResumeFileEntryId,
  useDeliveryResumeFiles,
} from "../job-assets/use-delivery-resume-files";

const props = defineProps<{ navigation: JobRepositoryNavigationState }>();
const emit = defineEmits<{
  open: [entry: ResumeLibraryEntry];
  toggleSidebar: [];
  navigate: [state: JobRepositoryNavigationState];
  agent: [action: "generate" | "match", jdId: string, title: string];
  record: [initial: Partial<ApplicationCreateInput>, asset: TrackerAssetTarget];
  tracker: [asset: TrackerAssetTarget];
  general: [];
  delivery: [file: DeliveryResumeFile, jd?: JobRepositoryJd];
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
  snapshot: repository.snapshot,
  selectedEntryId: selectedResumeId,
  view,
  query,
  resumeFilter,
  hasRegularResumeResults: () => filteredResumes.value.length > 0,
  load: repository.load,
  setError: (value) => { repository.error.value = value; },
  closeDetail: () => { detailOpen.value = false; },
});
const selectedJd = computed(() =>
  filteredJds.value.find((jd) => jd.id === selectedJdId.value) ?? filteredJds.value[0],
);
const selectedResume = computed(() => deliveryFiles.selected.value
  ? undefined
  : filteredResumes.value.find(
      (resume) => resume.entry.entryId === selectedResumeId.value,
    ) ?? filteredResumes.value[0],
);
const allEmpty = computed(() =>
  !repository.snapshot.value.jds.length && !repository.snapshot.value.resumes.length &&
  !repository.snapshot.value.deliveryResumeFiles.length,
);
const filterActive = computed(() =>
  Boolean(query.value.trim() || (view.value === "jobs" ? jobFilter.value : resumeFilter.value)),
);

watch(view, () => {
  query.value = "";
  detailOpen.value = false;
});
watch(
  [view, query, jobFilter, resumeFilter, selectedJdId, selectedResumeId, detailOpen],
  () => emit("navigate", {
    view: view.value,
    query: query.value,
    jobFilter: jobFilter.value,
    resumeFilter: resumeFilter.value,
    selectedJdId: selectedJdId.value,
    selectedResumeId: selectedResumeId.value,
    detailOpen: detailOpen.value,
  }),
);

function selectJd(id: string): void {
  selectedJdId.value = id;
  detailOpen.value = true;
}

function selectResume(id: string): void {
  selectedResumeId.value = id;
  detailOpen.value = true;
}

function selectDeliveryFile(id: string): void {
  deliveryFiles.select(id);
  detailOpen.value = true;
}

function showResumeFromJd(entryId: string): void {
  view.value = "resumes";
  query.value = "";
  resumeFilter.value = "";
  selectedResumeId.value = entryId;
  void nextTick(() => {
    detailOpen.value = true;
  });
}

function jdAsset(jd: JobRepositoryJd): TrackerAssetTarget {
  return { kind: "jd", id: jd.id, title: jd.title };
}

function resumeAsset(resume: JobRepositoryResume): TrackerAssetTarget | undefined {
  return resume.resumeId
    ? { kind: "resume", id: resume.resumeId, title: resume.entry.displayTitle }
    : undefined;
}

function recordJd(jd: JobRepositoryJd): void {
  emit("record", {
    jdId: jd.id,
    companyName: jd.company ?? "",
    roleName: jd.targetRole ?? "",
  }, jdAsset(jd));
}

function recordResume(resume: JobRepositoryResume): void {
  const asset = resumeAsset(resume);
  if (!asset) return;
  emit("record", {
    resumeId: asset.id,
    jdId: resume.primaryJd.state === "linked" ? resume.primaryJd.id : null,
  }, asset);
}

function trackResume(resume: JobRepositoryResume): void {
  const asset = resumeAsset(resume);
  if (asset) emit("tracker", asset);
}

function useDeliveryFile(file: DeliveryResumeFile, jd?: JobRepositoryJd): void {
  emit("delivery", file, jd);
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
      @refresh="repository.load()"
      @toggle-sidebar="$emit('toggleSidebar')"
      @generate-general="$emit('general')"
      @import-delivery="deliveryFiles.importFile"
    />

    <div v-if="repository.error.value" class="tracker-error-banner" role="alert">
      <span>{{ repository.error.value }}</span>
      <button type="button" @click="repository.load()">{{ $t('重试') }}</button>
    </div>

    <div v-if="repository.loading.value && allEmpty" class="repository-page-state">
      {{ $t('正在读取求职资产…') }}
    </div>
    <div v-else-if="allEmpty" class="repository-page-state">
      <BriefcaseBusiness :size="23" aria-hidden="true" />
      <strong>{{ $t('尚无 JD 和 Resume') }}</strong>
      <p>{{ $t('可回到对话创建或同步求职资产。') }}</p>
    </div>
    <div v-else class="repository-layout">
      <aside class="repository-list-pane">
        <JobRepositoryAssetList
          :view="view"
          :jds="filteredJds"
          :resumes="filteredResumes"
          :delivery-resume-files="deliveryFiles.filtered.value"
          :selected-id="view === 'jobs' ? selectedJd?.id : deliveryFiles.selected.value ? deliveryResumeFileEntryId(deliveryFiles.selected.value.id) : selectedResume?.entry.entryId"
          :empty-label="filterActive ? $t('没有符合当前搜索或筛选条件的结果') : view === 'jobs' ? $t('尚无 JD') : $t('尚无 Resume')"
          @select-jd="selectJd"
          @select-resume="selectResume"
          @select-delivery-file="selectDeliveryFile"
        />
      </aside>
      <section class="repository-detail-pane">
        <JobRepositoryJdDetail
          v-if="view === 'jobs' && selectedJd"
          :jd="selectedJd"
          :resumes="repository.snapshot.value.resumes"
          :delivery-resume-files="repository.snapshot.value.deliveryResumeFiles"
          @back="detailOpen = false"
          @generate="$emit('agent', 'generate', selectedJd.id, selectedJd.title)"
          @match="$emit('agent', 'match', selectedJd.id, selectedJd.title)"
          @record="recordJd(selectedJd)"
          @tracker="$emit('tracker', jdAsset(selectedJd))"
          @resume="showResumeFromJd"
          @delivery-file="useDeliveryFile($event, selectedJd)"
        />
        <JobRepositoryResumeDetail
          v-else-if="view === 'resumes' && selectedResume"
          :resume="selectedResume"
          @back="detailOpen = false"
          @open="$emit('open', $event)"
          @record="recordResume(selectedResume)"
          @tracker="trackResume(selectedResume)"
        />
        <DeliveryResumeFileDetail
          v-else-if="view === 'resumes' && deliveryFiles.selected.value"
          :file="deliveryFiles.selected.value"
          :busy="deliveryFiles.busy.value"
          @back="detailOpen = false"
          @use="useDeliveryFile(deliveryFiles.selected.value)"
          @rename="deliveryFiles.rename"
          @delete="deliveryFiles.remove"
        />
        <div v-else class="repository-page-state repository-detail-empty">
          {{ filterActive ? $t('调整搜索或筛选条件后重试') : $t('选择一项查看详情') }}
        </div>
      </section>
    </div>
  </div>
</template>
