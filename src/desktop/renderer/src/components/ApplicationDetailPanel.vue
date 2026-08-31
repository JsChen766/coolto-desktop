<script setup lang="ts">
import { BriefcaseBusiness, ExternalLink, FileText, Pencil, Trash2, X } from "@lucide/vue";
import { ref, watch } from "vue";

import type {
  ApplicationNote,
  ApplicationRecord,
  ApplicationReferenceOptions,
  ApplicationStatus,
  ApplicationTrackerDetail,
  ApplicationUpdateInput,
  InterviewRound,
  Reminder,
  SubmissionReceiptView,
} from "@desktop/types";
import {
  applicationFormOf,
  toUpdateInput,
} from "../tracker/application-form";
import {
  deliveryLabel,
  STATUS_LABELS,
  syncLabel,
} from "../tracker/application-labels";
import ApplicationEditorFields from "./ApplicationEditorFields.vue";
import ApplicationStatusMenu from "./ApplicationStatusMenu.vue";
import ApplicationSchedulePanel from "./ApplicationSchedulePanel.vue";
import ApplicationRecordPanel from "./ApplicationRecordPanel.vue";
import IconButton from "./IconButton.vue";

const props = defineProps<{
  application: ApplicationRecord;
  references: ApplicationReferenceOptions;
  busy?: boolean;
  error?: string | undefined;
  detail: ApplicationTrackerDetail;
  detailLoading?: boolean;
  submissionReceipt: SubmissionReceiptView | undefined;
  focusInterviewId?: string | undefined;
  calendarSupported?: boolean;
  calendarBusyId?: string | undefined;
  calendarMessage?: string | undefined;
}>();

const emit = defineEmits<{
  close: [];
  update: [changes: ApplicationUpdateInput];
  transition: [status: ApplicationStatus];
  delete: [];
  openUrl: [url: string];
  openAsset: [kind: "jd" | "resume", id: string];
  addInterview: [];
  editInterview: [value: InterviewRound];
  addNote: [];
  editNote: [value: ApplicationNote];
  addReminder: [];
  editReminder: [value: Reminder];
  removeChild: [kind: "interview" | "note" | "reminder", id: string];
  syncInterview: [value: InterviewRound];
}>();

const editing = ref(false);
const activeTab = ref<"overview" | "schedule" | "records">("overview");
const DETAIL_TABS = [
  { id: "overview", label: "概览" },
  { id: "schedule", label: "日程" },
  { id: "records", label: "记录" },
] as const;
const form = ref(applicationFormOf(props.application));

watch(() => props.focusInterviewId, (id) => { if (id) activeTab.value = "schedule"; }, {
  immediate: true,
});

watch(
  () => props.application,
  (application) => {
    form.value = applicationFormOf(application);
    editing.value = false;
  },
);

function save(): void {
  emit("update", toUpdateInput(form.value));
}
</script>

<template>
  <aside class="tracker-detail-panel">
    <header class="tracker-detail-header">
      <div>
        <span>{{ $t('投递详情') }}</span>
        <strong>{{ application.companyName }}</strong>
        <small>{{ application.roleName }}</small>
      </div>
      <IconButton :icon="X" :label="$t('关闭详情')" @click="$emit('close')" />
    </header>

    <div class="tracker-detail-toolbar">
      <span class="tracker-exact-status" :class="`status-${application.status}`">
        {{ STATUS_LABELS[application.status] }}
      </span>
      <span class="tracker-sync-state" :class="application.syncStatus">
        {{ syncLabel(application.syncStatus) }}
      </span>
      <ApplicationStatusMenu
        :status="application.status"
        :disabled="busy"
        @select="$emit('transition', $event)"
      />
    </div>
    <div v-if="error" class="tracker-detail-error" role="alert">{{ error }}</div>

    <nav class="tracker-detail-tabs" :aria-label="$t('投递详情分区')">
      <button v-for="tab in DETAIL_TABS" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">{{ $t(tab.label) }}</button>
    </nav>

    <form v-if="activeTab === 'overview' && editing" class="tracker-detail-edit" @submit.prevent="save">
      <ApplicationEditorFields
        v-model="form"
        :references="references"
        include-rejection-reason
        require-references
      />
      <div class="tracker-detail-edit-actions">
        <button class="secondary-button" type="button" @click="editing = false">{{ $t('取消') }}</button>
        <button class="primary-button" type="submit" :disabled="busy">{{ $t('保存修改') }}</button>
      </div>
    </form>

    <div v-else-if="activeTab === 'overview'" class="tracker-detail-content">
      <dl class="tracker-detail-list">
        <div><dt>{{ $t('投递时间') }}</dt><dd>{{ application.appliedAt ? new Date(application.appliedAt).toLocaleString($locale()) : $t('待确认') }}</dd></div>
        <div><dt>{{ $t('投递方式') }}</dt><dd>{{ deliveryLabel(application.deliveryMethod) }}</dd></div>
        <div><dt>{{ $t('关联 JD') }}</dt><dd>{{ application.jdTitleSnapshot ?? $t('未关联') }}</dd></div>
        <div><dt>{{ $t('投递简历') }}</dt><dd>{{ application.resumeTitleSnapshot ?? $t('未关联') }}</dd></div>
        <div>
          <dt>{{ $t('简历版本') }}</dt>
          <dd>{{ application.resumeContentHashSnapshot
            ? `${application.resumeContentHashSnapshot.slice(0, 12)}…`
            : $t('历史记录未锁定版本') }}</dd>
        </div>
        <div v-if="submissionReceipt">
          <dt>{{ $t('投递证据') }}</dt>
          <dd>
            {{ $t(submissionReceipt.status === 'confirmed' ? '已确认提交' : '提交结果待核验') }} ·
            {{ new Date(submissionReceipt.createdAt).toLocaleString($locale()) }} ·
            {{ submissionReceipt.resumeContentHash.slice(0, 12) }}…
          </dd>
        </div>
        <div v-else-if="application.source === 'browser'">
          <dt>{{ $t('投递证据') }}</dt><dd>{{ $t('本地投递证据已清除或不可用') }}</dd>
        </div>
        <div><dt>{{ $t('公司业务') }}</dt><dd>{{ application.companyBusiness ?? '—' }}</dd></div>
        <div><dt>{{ $t('岗位摘要') }}</dt><dd>{{ application.roleSummary ?? '—' }}</dd></div>
        <div><dt>{{ $t('公司文化') }}</dt><dd>{{ application.companyCulture ?? '—' }}</dd></div>
        <div v-if="application.rejectionReason"><dt>{{ $t('拒绝原因') }}</dt><dd>{{ application.rejectionReason }}</dd></div>
      </dl>
      <button
        v-if="application.targetUrl"
        class="tracker-target-link"
        type="button"
        @click="$emit('openUrl', application.targetUrl)"
      >
        <ExternalLink :size="14" aria-hidden="true" />{{ $t('查看岗位链接') }}
      </button>
      <div class="tracker-asset-links">
        <button
          v-if="application.jdId"
          class="secondary-button icon-label"
          type="button"
          @click="$emit('openAsset', 'jd', application.jdId)"
        >
          <BriefcaseBusiness :size="14" aria-hidden="true" />{{ $t('查看 JD') }}
        </button>
        <button
          v-if="application.resumeId"
          class="secondary-button icon-label"
          type="button"
          @click="$emit('openAsset', 'resume', application.resumeId)"
        >
          <FileText :size="14" aria-hidden="true" />{{ $t('查看 Resume') }}
        </button>
      </div>
    </div>

    <div v-else-if="detailLoading" class="tracker-loading">{{ $t('正在读取本地日程…') }}</div>
    <ApplicationSchedulePanel
      v-else-if="activeTab === 'schedule'"
      :interviews="detail.interviews"
      :reminders="detail.reminders"
      :busy="busy"
      :focus-interview-id="focusInterviewId"
      :calendar-supported="calendarSupported"
      :calendar-busy-id="calendarBusyId"
      :calendar-message="calendarMessage"
      @add-interview="$emit('addInterview')"
      @edit-interview="$emit('editInterview', $event)"
      @add-reminder="$emit('addReminder')"
      @edit-reminder="$emit('editReminder', $event)"
      @remove="(kind, id) => $emit('removeChild', kind, id)"
      @sync-interview="$emit('syncInterview', $event)"
    />
    <ApplicationRecordPanel
      v-else
      :application="application"
      :events="detail.statusEvents"
      :notes="detail.notes"
      :interviews="detail.interviews"
      :busy="busy"
      @add-note="$emit('addNote')"
      @edit-note="$emit('editNote', $event)"
      @remove-note="$emit('removeChild', 'note', $event)"
    />

    <footer v-if="activeTab === 'overview' && !editing" class="tracker-detail-footer">
      <button class="secondary-button icon-label" type="button" @click="editing = true">
        <Pencil :size="14" aria-hidden="true" />{{ $t('编辑信息') }}
      </button>
      <button class="tracker-delete-button icon-label" type="button" @click="$emit('delete')">
        <Trash2 :size="14" aria-hidden="true" />{{ $t('删除记录') }}
      </button>
    </footer>
  </aside>
</template>
