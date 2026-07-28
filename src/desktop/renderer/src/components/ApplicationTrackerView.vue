<script setup lang="ts">
import { ArrowLeft, Plus, RefreshCw, Search } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";

import type {
  ApplicationRecord,
  ApplicationStatus,
  ApplicationUpdateInput,
} from "@desktop/types";
import { useApplicationTracker } from "../tracker/use-application-tracker";
import { desktopApi } from "../lib/desktop-api";
import {
  APPLICATION_BOARD_COLUMNS,
  applicationsInColumn,
  type TrackerViewMode,
} from "../tracker/application-board";
import ApplicationBoardColumn from "./ApplicationBoardColumn.vue";
import ApplicationCalendarView from "./ApplicationCalendarView.vue";
import ApplicationCreateDialog from "./ApplicationCreateDialog.vue";
import ApplicationDeleteDialog from "./ApplicationDeleteDialog.vue";
import ApplicationDetailPanel from "./ApplicationDetailPanel.vue";
import ApplicationTransitionDialog from "./ApplicationTransitionDialog.vue";
import ApplicationTimelineView from "./ApplicationTimelineView.vue";
import ApplicationViewSwitcher from "./ApplicationViewSwitcher.vue";

defineEmits<{ close: [] }>();

const tracker = useApplicationTracker();
const query = ref("");
const activeView = ref<TrackerViewMode>("board");
const createOpen = ref(false);
const transitionTarget = ref<ApplicationStatus>();
const transitionApplication = ref<ApplicationRecord>();
const deleteTarget = ref<ApplicationRecord>();

const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase();
  return !value
    ? tracker.applications.value
    : tracker.applications.value.filter((application) =>
        [application.companyName, application.roleName].some((text) =>
          text.toLocaleLowerCase().includes(value),
        ),
      );
});

onMounted(() => tracker.load());

function applicationsFor(statuses: readonly ApplicationStatus[]): ApplicationRecord[] {
  return applicationsInColumn(filtered.value, statuses);
}

function prepareTransition(application: ApplicationRecord, target: ApplicationStatus): void {
  transitionApplication.value = application;
  transitionTarget.value = target;
}

async function confirmTransition(reason: string | null): Promise<void> {
  if (!transitionApplication.value || !transitionTarget.value) return;
  try {
    await tracker.transition(
      transitionApplication.value,
      transitionTarget.value,
      reason,
    );
    transitionApplication.value = undefined;
    transitionTarget.value = undefined;
  } catch {
    // The composable exposes the server error in the board banner.
  }
}

async function updateSelected(changes: ApplicationUpdateInput): Promise<void> {
  if (!tracker.selected.value) return;
  try {
    await tracker.update(tracker.selected.value.id, changes);
  } catch {
    // Keep the editor open so the user can retry or cancel.
  }
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  try {
    await tracker.remove(deleteTarget.value);
    deleteTarget.value = undefined;
  } catch {
    // Keep the confirmation open and surface the error banner.
  }
}
</script>

<template>
  <div class="tracker-view">
    <header class="tracker-view-header">
      <button class="tracker-back-button" type="button" @click="$emit('close')">
        <ArrowLeft :size="16" aria-hidden="true" />返回对话
      </button>
      <label class="tracker-search">
        <Search :size="15" aria-hidden="true" />
        <input v-model="query" placeholder="搜索公司或岗位" aria-label="搜索投递记录" />
      </label>
      <button
        class="tracker-refresh-button"
        type="button"
        :disabled="tracker.loading.value"
        aria-label="刷新投递记录"
        title="刷新投递记录"
        @click="tracker.load()"
      >
        <RefreshCw :size="16" :class="{ spin: tracker.loading.value }" aria-hidden="true" />
      </button>
      <button class="primary-button tracker-create-button" type="button" @click="createOpen = true">
        <Plus :size="15" aria-hidden="true" />记录投递
      </button>
    </header>

    <div v-if="tracker.error.value" class="tracker-error-banner" role="alert">
      <span>{{ tracker.error.value }}</span>
      <button type="button" @click="tracker.load()">重试</button>
    </div>

    <div class="tracker-view-toolbar">
      <ApplicationViewSwitcher v-model="activeView" />
      <div class="tracker-stage-legend" aria-label="阶段颜色说明">
        <span v-for="column in APPLICATION_BOARD_COLUMNS" :key="column.key" :class="`stage-${column.key}`">
          <i aria-hidden="true" />{{ column.title }}
        </span>
      </div>
    </div>

    <div v-if="tracker.loading.value && !tracker.applications.value.length" class="tracker-loading">
      正在读取本地投递记录…
    </div>
    <div v-else-if="activeView === 'board'" class="tracker-board">
      <ApplicationBoardColumn
        v-for="column in APPLICATION_BOARD_COLUMNS"
        :key="column.key"
        :title="column.title"
        :description="column.description"
        :applications="applicationsFor(column.statuses)"
        :busy="tracker.busy.value"
        @open="tracker.selected.value = $event"
        @transition="prepareTransition"
      />
    </div>
    <ApplicationTimelineView
      v-else-if="activeView === 'timeline'"
      :applications="filtered"
      @open="tracker.selected.value = $event"
    />
    <ApplicationCalendarView
      v-else
      :applications="filtered"
      @open="tracker.selected.value = $event"
    />

    <ApplicationDetailPanel
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
    />

    <ApplicationCreateDialog
      v-if="createOpen"
      :references="tracker.references.value"
      :busy="tracker.busy.value"
      :error="tracker.error.value"
      @close="createOpen = false"
      @submit="tracker.create($event).then(() => { createOpen = false }).catch(() => undefined)"
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
      @close="deleteTarget = undefined"
      @confirm="confirmDelete"
    />
  </div>
</template>
