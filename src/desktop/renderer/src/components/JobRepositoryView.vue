<script setup lang="ts">
import { BriefcaseBusiness, FileText, Menu, RefreshCw, Search } from "@lucide/vue";
import { computed, ref, watch } from "vue";

import type {
  ApplicationCreateInput,
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
import JobRepositoryJdDetail from "./JobRepositoryJdDetail.vue";
import JobRepositoryResumeDetail from "./JobRepositoryResumeDetail.vue";

const props = defineProps<{ navigation: JobRepositoryNavigationState }>();
const emit = defineEmits<{
  open: [entry: ResumeLibraryEntry];
  toggleSidebar: [];
  navigate: [state: JobRepositoryNavigationState];
  agent: [action: "generate" | "match", jdId: string, title: string];
  record: [initial: Partial<ApplicationCreateInput>, asset: TrackerAssetTarget];
  tracker: [asset: TrackerAssetTarget];
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
const selectedJd = computed(() =>
  filteredJds.value.find((jd) => jd.id === selectedJdId.value) ?? filteredJds.value[0],
);
const selectedResume = computed(() =>
  filteredResumes.value.find((resume) => resume.entry.entryId === selectedResumeId.value)
  ?? filteredResumes.value[0],
);
const allEmpty = computed(() =>
  !repository.snapshot.value.jds.length && !repository.snapshot.value.resumes.length,
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
</script>

<template>
  <div class="tracker-view job-repository-view" :class="{ 'detail-open': detailOpen }">
    <header class="repository-header window-drag">
      <button
        class="repository-sidebar-toggle icon-button no-drag"
        type="button"
        aria-label="打开侧栏"
        title="打开侧栏"
        @click="$emit('toggleSidebar')"
      >
        <Menu :size="17" aria-hidden="true" />
      </button>
      <div class="repository-heading">
        <h1>求职仓库</h1>
        <p>岗位、简历与实际投递关系</p>
      </div>
      <nav class="tracker-view-switcher no-drag" aria-label="求职仓库视角">
        <button type="button" :class="{ active: view === 'jobs' }" @click="view = 'jobs'">
          <BriefcaseBusiness :size="14" aria-hidden="true" />岗位
        </button>
        <button type="button" :class="{ active: view === 'resumes' }" @click="view = 'resumes'">
          <FileText :size="14" aria-hidden="true" />简历
        </button>
      </nav>
      <div class="repository-tools no-drag">
        <label class="repository-search">
          <Search :size="15" aria-hidden="true" />
          <input
            v-model="query"
            :placeholder="view === 'jobs' ? '搜索公司、岗位或 JD' : '搜索简历或目标岗位'"
            :aria-label="view === 'jobs' ? '搜索岗位' : '搜索简历'"
          />
        </label>
        <select v-if="view === 'jobs'" v-model="jobFilter" aria-label="筛选岗位">
          <option value="">全部岗位</option>
          <option value="with_resumes">有简历</option>
          <option value="without_resumes">无简历</option>
          <option value="applied">已有投递</option>
          <option value="conflict">同步冲突</option>
        </select>
        <select v-else v-model="resumeFilter" aria-label="筛选简历">
          <option value="">全部简历</option>
          <option value="targeted">针对性</option>
          <option value="generic">通用</option>
          <option value="archived">归档</option>
          <option value="local_only">仅本机</option>
          <option value="conflict">同步冲突</option>
        </select>
        <button
          class="repository-refresh icon-button"
          type="button"
          :disabled="repository.loading.value"
          aria-label="刷新求职仓库"
          title="刷新求职仓库"
          @click="repository.load()"
        >
          <RefreshCw :size="16" :class="{ spin: repository.loading.value }" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="repository.error.value" class="tracker-error-banner" role="alert">
      <span>{{ repository.error.value }}</span>
      <button type="button" @click="repository.load()">重试</button>
    </div>

    <div v-if="repository.loading.value && allEmpty" class="repository-page-state">
      正在读取求职资产…
    </div>
    <div v-else-if="allEmpty" class="repository-page-state">
      <BriefcaseBusiness :size="23" aria-hidden="true" />
      <strong>尚无 JD 和 Resume</strong>
      <p>可回到对话创建或同步求职资产。</p>
    </div>
    <div v-else class="repository-layout">
      <aside class="repository-list-pane">
        <JobRepositoryAssetList
          :view="view"
          :jds="filteredJds"
          :resumes="filteredResumes"
          :selected-id="view === 'jobs' ? selectedJd?.id : selectedResume?.entry.entryId"
          :empty-label="filterActive ? '没有符合当前搜索或筛选条件的结果' : view === 'jobs' ? '尚无 JD' : '尚无 Resume'"
          @select-jd="selectJd"
          @select-resume="selectResume"
        />
      </aside>
      <section class="repository-detail-pane">
        <JobRepositoryJdDetail
          v-if="view === 'jobs' && selectedJd"
          :jd="selectedJd"
          :resumes="repository.snapshot.value.resumes"
          @back="detailOpen = false"
          @generate="$emit('agent', 'generate', selectedJd.id, selectedJd.title)"
          @match="$emit('agent', 'match', selectedJd.id, selectedJd.title)"
          @record="recordJd(selectedJd)"
          @tracker="$emit('tracker', jdAsset(selectedJd))"
        />
        <JobRepositoryResumeDetail
          v-else-if="view === 'resumes' && selectedResume"
          :resume="selectedResume"
          @back="detailOpen = false"
          @open="$emit('open', $event)"
          @record="recordResume(selectedResume)"
          @tracker="trackResume(selectedResume)"
        />
        <div v-else class="repository-page-state repository-detail-empty">
          {{ filterActive ? '调整搜索或筛选条件后重试' : '选择一项查看详情' }}
        </div>
      </section>
    </div>
  </div>
</template>
