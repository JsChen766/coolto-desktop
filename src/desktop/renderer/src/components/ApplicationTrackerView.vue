<script setup lang="ts">
import { ArrowLeft, Plus, RefreshCw, Search } from "@lucide/vue";
import { onMounted } from "vue";

import type { TrackerNavigationContext } from "../tracker/tracker-navigation";
import { useApplicationTrackerPage } from "../tracker/use-application-tracker-page";
import { desktopApi } from "../lib/desktop-api";
import { APPLICATION_BOARD_COLUMNS } from "../tracker/application-board";
import ApplicationBoardColumn from "./ApplicationBoardColumn.vue";
import ApplicationCalendarView from "./ApplicationCalendarView.vue";
import ApplicationCreateDialog from "./ApplicationCreateDialog.vue";
import ApplicationCorrectionDialog from "./ApplicationCorrectionDialog.vue";
import ApplicationDeleteDialog from "./ApplicationDeleteDialog.vue";
import ApplicationDetailShell from "./ApplicationDetailShell.vue";
import ApplicationTransitionDialog from "./ApplicationTransitionDialog.vue";
import ApplicationTimelineView from "./ApplicationTimelineView.vue";
import ApplicationViewSwitcher from "./ApplicationViewSwitcher.vue";
import { useTrackerOverview } from "../tracker/use-tracker-overview";
import { useTrackerSyncRecovery } from "../tracker/use-tracker-sync-recovery";
import TrackerSyncIssuesDialog from "./TrackerSyncIssuesDialog.vue";

const props = defineProps<{ context?: TrackerNavigationContext }>();
const emit = defineEmits<{
  close: [];
  openAsset: [kind: "jd" | "resume", id: string];
  applicationOpened: [applicationId: string];
}>();

const page = useApplicationTrackerPage(() => props.context);
const overview = useTrackerOverview();
const recovery = useTrackerSyncRecovery(async () => {
  await Promise.all([tracker.load(), overview.load()]);
});
onMounted(() => Promise.all([overview.load(), recovery.load()]));
const {
  activeView, applicationsFor, confirmDelete, confirmTransition,
  correctionProposal, createInitial, createOpen, createProposal, deleteTarget,
  executeCorrection, executeCreate, filtered, prepareCreate, prepareTransition,
  query, tracker, transitionApplication, transitionTarget, updateSelected,
} = page;

function openAsset(kind: "jd" | "resume", id: string): void {
  emit("openAsset", kind, id);
}
async function refresh(): Promise<void> {
  await recovery.retryPending();
  await Promise.all([tracker.load(), overview.load(), recovery.load()]);
}
async function childrenChanged(): Promise<void> {
  await Promise.all([overview.load(), recovery.load()]);
}
function openApplication(application: (typeof filtered.value)[number]): void {
  tracker.selected.value = application;
  emit("applicationOpened", application.id);
}
</script>

<template>
  <div class="tracker-view">
    <header class="tracker-view-header">
      <button class="tracker-back-button" type="button" @click="$emit('close')">
        <ArrowLeft :size="16" aria-hidden="true" />
        {{ context?.returnToRepository ? $t('返回求职仓库') : $t('返回对话') }}
      </button>
      <label class="tracker-search">
        <Search :size="15" aria-hidden="true" />
        <input v-model="query" :placeholder="$t('搜索公司或岗位')" :aria-label="$t('搜索投递记录')" />
      </label>
      <button
        class="tracker-refresh-button"
        type="button"
        :disabled="tracker.loading.value"
        :aria-label="$t('刷新投递记录')"
        :title="$t('刷新投递记录')"
        @click="refresh"
      >
        <RefreshCw :size="16" :class="{ spin: tracker.loading.value }" aria-hidden="true" />
      </button>
      <button class="primary-button tracker-create-button" type="button" @click="createOpen = true">
        <Plus :size="15" aria-hidden="true" />{{ $t('记录投递') }}
      </button>
    </header>
    <div v-if="context?.asset" class="tracker-context-filter">
      {{ $tf('仅显示与 {title} 精确关联的投递', { title: context.asset.title }) }}
    </div>

    <div v-if="tracker.error.value" class="tracker-error-banner" role="alert">
      <span>{{ tracker.error.value }}</span>
      <button type="button" @click="tracker.load()">{{ $t('重试') }}</button>
    </div>
    <div v-if="recovery.issues.value.length" class="tracker-error-banner" role="alert">
      <span>{{ $tf('{count} 项 Tracker 修改需要处理', { count: recovery.issues.value.length }) }}</span>
      <button type="button" @click="recovery.open.value = true">{{ $t('查看并处理') }}</button>
    </div>

    <div class="tracker-view-toolbar">
      <ApplicationViewSwitcher v-model="activeView" />
      <div class="tracker-stage-legend" :aria-label="$t('阶段颜色说明')">
        <span v-for="column in APPLICATION_BOARD_COLUMNS" :key="column.key" :class="`stage-${column.key}`">
          <i aria-hidden="true" />{{ $t(column.title) }}
        </span>
      </div>
    </div>

    <div v-if="tracker.loading.value && !tracker.applications.value.length" class="tracker-loading">
      {{ $t('正在读取本地投递记录…') }}
    </div>
    <div v-else-if="activeView === 'board'" class="tracker-board">
      <ApplicationBoardColumn
        v-for="column in APPLICATION_BOARD_COLUMNS"
        :key="column.key"
        :title="$t(column.title)"
        :description="$t(column.description)"
        :applications="applicationsFor(column.statuses)"
        :busy="tracker.busy.value"
        :interviews="overview.snapshot.value.interviews"
        :reminders="overview.snapshot.value.reminders"
        @open="openApplication"
        @transition="prepareTransition"
      />
    </div>
    <ApplicationTimelineView
      v-else-if="activeView === 'timeline'"
      :applications="filtered"
      :events="overview.snapshot.value.statusEvents"
      :interviews="overview.snapshot.value.interviews"
      @open="openApplication"
    />
    <ApplicationCalendarView
      v-else
      :applications="filtered"
      :interviews="overview.snapshot.value.interviews"
      :reminders="overview.snapshot.value.reminders"
      @open="openApplication"
    />

    <ApplicationDetailShell
      v-if="tracker.selected.value"
      :application="tracker.selected.value"
      :references="tracker.references.value"
      :busy="tracker.busy.value"
      :error="tracker.error.value"
      @close="tracker.selected.value = undefined"
      @update="updateSelected"
      @transition="prepareTransition(tracker.selected.value!, $event)"
      @delete="deleteTarget = tracker.selected.value"
      @open-url="desktopApi.browser.open({ url: $event })"
      @open-asset="openAsset"
      @children-changed="childrenChanged"
    />

    <ApplicationCreateDialog
      v-if="createOpen"
      :references="tracker.references.value"
      :initial="createInitial"
      :proposal="createProposal"
      :busy="tracker.busy.value"
      :error="tracker.error.value"
      @close="createOpen = false; createProposal = undefined"
      @back="createProposal = undefined"
      @review="prepareCreate"
      @confirm="executeCreate"
    />
    <ApplicationCorrectionDialog
      v-if="correctionProposal"
      :proposal="correctionProposal"
      :busy="tracker.busy.value"
      :error="tracker.error.value"
      @close="correctionProposal = undefined"
      @confirm="executeCorrection"
    />
    <ApplicationTransitionDialog
      v-if="transitionApplication && transitionTarget"
      :application="transitionApplication"
      :target="transitionTarget"
      :busy="tracker.busy.value"
      :error="tracker.error.value"
      @close="transitionApplication = undefined; transitionTarget = undefined"
      @confirm="confirmTransition"
    />
    <ApplicationDeleteDialog
      v-if="deleteTarget"
      :application="deleteTarget"
      :busy="tracker.busy.value"
      :error="tracker.error.value"
      :child-counts="{
        interviews: overview.snapshot.value.interviews.filter(item => item.applicationId === deleteTarget!.id).length,
        notes: overview.snapshot.value.notes.filter(item => item.applicationId === deleteTarget!.id).length,
        reminders: overview.snapshot.value.reminders.filter(item => item.applicationId === deleteTarget!.id).length,
      }"
      @close="deleteTarget = undefined"
      @confirm="confirmDelete"
    />
    <TrackerSyncIssuesDialog
      v-if="recovery.open.value"
      :issues="recovery.issues.value"
      :proposal="recovery.proposal.value"
      :busy="recovery.busy.value"
      :error="recovery.error.value"
      @close="recovery.open.value = false"
      @back="recovery.proposal.value = undefined"
      @prepare="recovery.prepare"
      @confirm="recovery.execute"
    />
  </div>
</template>
