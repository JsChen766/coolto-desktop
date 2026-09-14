<script setup lang="ts">
import type {
  ApplicationCreateInput,
  DeliveryResumeFile,
  JobRepositoryJd,
  JobRepositoryResume,
  ResumeLibraryEntry,
} from "@desktop/types";
import { REPOSITORY_VIEW_ORDER } from "../motion/segment-view-motion";
import { jdTrackerTarget, resumeTrackerTarget } from "../job-assets/job-repository-tracker-target";
import type { RepositoryView } from "../job-assets/job-repository-filter";
import type { TrackerAssetTarget } from "../tracker/tracker-navigation";
import JobRepositoryAssetList from "./JobRepositoryAssetList.vue";
import SegmentViewTransition from "./SegmentViewTransition.vue";
import JobRepositoryJdDetail from "./JobRepositoryJdDetail.vue";
import JobRepositoryResumeDetail from "./JobRepositoryResumeDetail.vue";
import DeliveryResumeFileDetail from "./DeliveryResumeFileDetail.vue";

defineProps<{
  view: RepositoryView;
  jds: readonly JobRepositoryJd[];
  resumes: readonly JobRepositoryResume[];
  allResumes: readonly JobRepositoryResume[];
  deliveryFiles: readonly DeliveryResumeFile[];
  selectedJd: JobRepositoryJd | undefined;
  selectedResume: JobRepositoryResume | undefined;
  selectedDelivery: DeliveryResumeFile | undefined;
  selectedListId: string | undefined;
  deliveryBusy: boolean;
}>();
const emit = defineEmits<{
  selectJd: [id: string];
  selectResume: [id: string];
  selectDeliveryFile: [id: string];
  agent: [action: "generate" | "match", jdId: string, title: string];
  record: [initial: Partial<ApplicationCreateInput>, asset: TrackerAssetTarget];
  tracker: [asset: TrackerAssetTarget];
  open: [entry: ResumeLibraryEntry];
  resumeLoop: [resume: JobRepositoryResume];
  delivery: [file: DeliveryResumeFile];
  renameDelivery: [title: string];
  removeDelivery: [];
  back: [];
  resumeFromJd: [entryId: string];
  jdFromResume: [jdId: string];
}>();

function recordJd(jd: JobRepositoryJd): void {
  emit("record", {
    jdId: jd.id,
    companyName: jd.company ?? "",
    roleName: jd.targetRole ?? "",
  }, jdTrackerTarget(jd));
}

function recordResume(resume: JobRepositoryResume): void {
  const asset = resumeTrackerTarget(resume);
  if (!asset) return;
  emit("record", {
    resumeId: asset.id,
    jdId: resume.primaryJd.state === "linked" ? resume.primaryJd.id : null,
  }, asset);
}

function trackResume(resume: JobRepositoryResume): void {
  const asset = resumeTrackerTarget(resume);
  if (asset) emit("tracker", asset);
}
</script>

<template>
  <SegmentViewTransition :view-key="view" :order="REPOSITORY_VIEW_ORDER" stage-class="repository-view-stage">
    <div class="repository-layout">
      <aside class="repository-list-pane">
        <JobRepositoryAssetList
          :view="view"
          :jds="jds"
          :resumes="resumes"
          :delivery-resume-files="deliveryFiles"
          :selected-id="selectedListId"
          @select-jd="emit('selectJd', $event)"
          @select-resume="emit('selectResume', $event)"
          @select-delivery-file="emit('selectDeliveryFile', $event)"
        />
      </aside>
      <section class="repository-detail-pane">
        <JobRepositoryJdDetail
          v-if="view === 'jobs' && selectedJd"
          :jd="selectedJd"
          :resumes="allResumes"
          @back="emit('back')"
          @generate="emit('agent', 'generate', selectedJd.id, selectedJd.title)"
          @match="emit('agent', 'match', selectedJd.id, selectedJd.title)"
          @record="recordJd(selectedJd)"
          @tracker="emit('tracker', jdTrackerTarget(selectedJd))"
          @resume="emit('resumeFromJd', $event)"
        />
        <JobRepositoryResumeDetail
          v-else-if="view === 'resumes' && selectedResume"
          :resume="selectedResume"
          @back="emit('back')"
          @open="emit('open', $event)"
          @record="recordResume(selectedResume)"
          @tracker="trackResume(selectedResume)"
          @automate="emit('resumeLoop', selectedResume)"
          @jd="emit('jdFromResume', $event)"
        />
        <DeliveryResumeFileDetail
          v-else-if="view === 'resumes' && selectedDelivery"
          :file="selectedDelivery"
          :busy="deliveryBusy"
          @back="emit('back')"
          @use="emit('delivery', selectedDelivery)"
          @rename="emit('renameDelivery', $event)"
          @delete="emit('removeDelivery')"
        />
      </section>
    </div>
  </SegmentViewTransition>
</template>
