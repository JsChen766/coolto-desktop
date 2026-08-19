<script setup lang="ts">
import {
  ChartNoAxesCombined,
  CloudUpload,
  Download,
  FileText,
  Globe,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "@lucide/vue";
import { ref } from "vue";

import type { ResumeDraftDetail } from "@desktop/types";
import { translate } from "../i18n/locale";
import IconButton from "./IconButton.vue";

const props = defineProps<{
  title: string;
  sidebarOpen: boolean;
  artifactOpen: boolean;
  browserOpen: boolean;
  resumeDraft: ResumeDraftDetail | undefined;
  exporting?: boolean;
  exportMessage?: string;
  savingToLibrary?: boolean;
  saveMessage?: string;
}>();

defineEmits<{
  toggleSidebar: [];
  toggleArtifact: [];
  toggleBrowser: [];
  saveResume: [];
  exportResume: [];
  rename: [];
}>();

const detailsOpen = ref(false);

function percent(value: number | null): string {
  return value === null ? translate("暂无") : `${(value * 100).toFixed(1)}%`;
}

function factLabel(value: ResumeDraftDetail["quality"]["factIntegrity"]): string {
  if (value === "passed") return translate("已通过");
  if (value === "failed") return translate("未通过");
  return translate("待重新验证");
}

function resumeActionLabel(action: "保存到简历库" | "导出到本地文件"): string {
  const blocker = props.resumeDraft?.generationReadiness.blockers[0]?.message;
  return blocker ? `${translate(action)}：${blocker}` : translate(action);
}
</script>

<template>
  <header
    class="chat-header window-drag"
    data-testid="resume-active-draft-status"
    :data-artifact-id="resumeDraft?.artifactId ?? ''"
    :data-revision="resumeDraft?.revision ?? ''"
    :data-workspace-status="resumeDraft?.workspaceStatus ?? ''"
    :data-page-count="resumeDraft?.compileResult.pageCount ?? ''"
    :data-page-usage-ratio="resumeDraft?.compileResult.usageRatio ?? ''"
    :data-generation-ready="resumeDraft ? String(resumeDraft.generationReadiness.ready) : ''"
    :data-blocker-codes="resumeDraft?.generationReadiness.blockers.map((item) => item.code).join(',') ?? ''"
  >
    <div class="chat-header-left no-drag">
      <IconButton
        :icon="sidebarOpen ? PanelLeftClose : PanelLeftOpen"
        :label="sidebarOpen ? $t('收起侧栏') : $t('展开侧栏')"
        @click="$emit('toggleSidebar')"
      />
      <button class="chat-title" type="button" @click="$emit('rename')">
        {{ title }}
      </button>
    </div>

    <div class="chat-header-actions no-drag">
      <IconButton
        :icon="Globe"
        :label="$t('浏览器')"
        :active="browserOpen"
        @click="$emit('toggleBrowser')"
      />
      <div v-if="artifactOpen && resumeDraft" class="resume-header-tools">
        <IconButton
          :icon="ChartNoAxesCombined"
          :label="$t('高级详情')"
          :active="detailsOpen"
          @click="detailsOpen = !detailsOpen"
        />
        <IconButton
          :icon="CloudUpload"
          :label="resumeActionLabel('保存到简历库')"
          :disabled="
            savingToLibrary ||
            !resumeDraft.generationReadiness.ready ||
            Boolean(resumeDraft.pendingChange)
          "
          @click="$emit('saveResume')"
        />
        <IconButton
          :icon="Download"
          :label="resumeActionLabel('导出到本地文件')"
          :disabled="
            exporting ||
            !resumeDraft.generationReadiness.ready ||
            Boolean(resumeDraft.pendingChange)
          "
          @click="$emit('exportResume')"
        />
        <span v-if="exporting" class="resume-export-status">
          <LoaderCircle class="spin" :size="13" :stroke-width="1.8" aria-hidden="true" />
          {{ $t('正在导出…') }}
        </span>
        <span v-else-if="exportMessage" class="resume-export-status">
          {{ exportMessage }}
        </span>
        <span v-else-if="savingToLibrary" class="resume-export-status">
          <LoaderCircle class="spin" :size="13" :stroke-width="1.8" aria-hidden="true" />
          {{ $t('正在保存到简历库…') }}
        </span>
        <span v-else-if="saveMessage" class="resume-export-status">
          {{ saveMessage }}
        </span>
        <div v-if="detailsOpen" class="resume-details-popover">
          <div class="resume-detail-row">
            <span>{{ $t('页面占比') }}</span>
            <strong>{{ percent(resumeDraft.quality.pageUsageRatio) }}</strong>
            <small>{{ $t('目标 92%') }}</small>
          </div>
          <div class="resume-detail-row">
            <span>{{ $t('最低尾行') }}</span>
            <strong>{{ percent(resumeDraft.quality.minimumBulletTailRatio) }}</strong>
            <small>{{ $t('目标 ≥ 75%') }}</small>
          </div>
          <div class="resume-detail-row">
            <span>{{ $t('事实完整性') }}</span>
            <strong>{{ factLabel(resumeDraft.quality.factIntegrity) }}</strong>
          </div>
          <div class="resume-detail-row">
            <span>{{ $t('JD 覆盖') }}</span>
            <strong v-if="resumeDraft.quality.jdCoverage">
              {{ resumeDraft.quality.jdCoverage.covered }}/{{ resumeDraft.quality.jdCoverage.total }}
            </strong>
            <strong v-else>{{ $t('未关联 JD') }}</strong>
          </div>
        </div>
      </div>
      <button
        class="preview-toggle icon-label"
        :class="{ active: artifactOpen }"
        type="button"
        @click="$emit('toggleArtifact')"
      >
        <FileText :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t('预览') }}</span>
      </button>
    </div>
  </header>
</template>
