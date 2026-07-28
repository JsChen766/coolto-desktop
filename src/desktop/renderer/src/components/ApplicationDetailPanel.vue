<script setup lang="ts">
import { ExternalLink, Pencil, Trash2, X } from "@lucide/vue";
import { ref, watch } from "vue";

import type {
  ApplicationRecord,
  ApplicationReferenceOptions,
  ApplicationStatus,
  ApplicationUpdateInput,
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
import IconButton from "./IconButton.vue";

const props = defineProps<{
  application: ApplicationRecord;
  references: ApplicationReferenceOptions;
  busy?: boolean;
  error?: string | undefined;
}>();

const emit = defineEmits<{
  close: [];
  update: [changes: ApplicationUpdateInput];
  transition: [status: ApplicationStatus];
  delete: [];
  openUrl: [url: string];
}>();

const editing = ref(false);
const form = ref(applicationFormOf(props.application));

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
        <span>投递详情</span>
        <strong>{{ application.companyName }}</strong>
        <small>{{ application.roleName }}</small>
      </div>
      <IconButton :icon="X" label="关闭详情" @click="$emit('close')" />
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

    <form v-if="editing" class="tracker-detail-edit" @submit.prevent="save">
      <ApplicationEditorFields
        v-model="form"
        :references="references"
        include-rejection-reason
      />
      <div class="tracker-detail-edit-actions">
        <button class="secondary-button" type="button" @click="editing = false">取消</button>
        <button class="primary-button" type="submit" :disabled="busy">保存修改</button>
      </div>
    </form>

    <div v-else class="tracker-detail-content">
      <dl class="tracker-detail-list">
        <div><dt>投递时间</dt><dd>{{ application.appliedAt ? new Date(application.appliedAt).toLocaleString('zh-CN') : '待确认' }}</dd></div>
        <div><dt>投递方式</dt><dd>{{ deliveryLabel(application.deliveryMethod) }}</dd></div>
        <div><dt>关联 JD</dt><dd>{{ application.jdTitleSnapshot ?? '未关联' }}</dd></div>
        <div><dt>投递简历</dt><dd>{{ application.resumeTitleSnapshot ?? '未关联' }}</dd></div>
        <div><dt>公司业务</dt><dd>{{ application.companyBusiness ?? '—' }}</dd></div>
        <div><dt>岗位摘要</dt><dd>{{ application.roleSummary ?? '—' }}</dd></div>
        <div><dt>公司文化</dt><dd>{{ application.companyCulture ?? '—' }}</dd></div>
        <div v-if="application.rejectionReason"><dt>拒绝原因</dt><dd>{{ application.rejectionReason }}</dd></div>
      </dl>
      <button
        v-if="application.targetUrl"
        class="tracker-target-link"
        type="button"
        @click="$emit('openUrl', application.targetUrl)"
      >
        <ExternalLink :size="14" aria-hidden="true" />查看岗位链接
      </button>
    </div>

    <footer v-if="!editing" class="tracker-detail-footer">
      <button class="secondary-button icon-label" type="button" @click="editing = true">
        <Pencil :size="14" aria-hidden="true" />编辑信息
      </button>
      <button class="tracker-delete-button icon-label" type="button" @click="$emit('delete')">
        <Trash2 :size="14" aria-hidden="true" />删除记录
      </button>
    </footer>
  </aside>
</template>
