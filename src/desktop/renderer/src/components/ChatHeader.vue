<script setup lang="ts">
import {
  ChartNoAxesCombined,
  CloudUpload,
  Download,
  FileText,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "@lucide/vue";
import { ref } from "vue";

import type { DesktopPlatform, ResumeDraftDetail } from "@desktop/types";
import IconButton from "./IconButton.vue";

defineProps<{
  title: string;
  sidebarOpen: boolean;
  artifactOpen: boolean;
  resumeDraft: ResumeDraftDetail | undefined;
  platform: DesktopPlatform;
}>();

defineEmits<{
  toggleSidebar: [];
  toggleArtifact: [];
  saveResume: [];
  exportResume: [];
  rename: [];
  minimize: [];
  maximize: [];
  close: [];
}>();

const detailsOpen = ref(false);

function percent(value: number | null): string {
  return value === null ? "暂无" : `${(value * 100).toFixed(1)}%`;
}

function factLabel(value: ResumeDraftDetail["quality"]["factIntegrity"]): string {
  if (value === "passed") return "已通过";
  if (value === "failed") return "未通过";
  return "待重新验证";
}
</script>

<template>
  <header class="chat-header window-drag">
    <div class="chat-header-left no-drag">
      <IconButton
        :icon="sidebarOpen ? PanelLeftClose : PanelLeftOpen"
        :label="sidebarOpen ? '收起侧栏' : '展开侧栏'"
        @click="$emit('toggleSidebar')"
      />
      <button class="chat-title" type="button" @click="$emit('rename')">
        {{ title }}
      </button>
    </div>

    <div class="chat-header-actions no-drag">
      <div v-if="artifactOpen && resumeDraft" class="resume-header-tools">
        <IconButton
          :icon="ChartNoAxesCombined"
          label="高级详情"
          :active="detailsOpen"
          @click="detailsOpen = !detailsOpen"
        />
        <IconButton
          :icon="CloudUpload"
          label="保存到云端"
          :disabled="
            resumeDraft.workspaceStatus !== 'ready_for_approval' ||
            Boolean(resumeDraft.pendingChange)
          "
          @click="$emit('saveResume')"
        />
        <IconButton
          :icon="Download"
          label="导出到本地文件"
          :disabled="
            resumeDraft.workspaceStatus !== 'ready_for_approval' ||
            !resumeDraft.compileResult.qualified ||
            Boolean(resumeDraft.pendingChange)
          "
          @click="$emit('exportResume')"
        />
        <div v-if="detailsOpen" class="resume-details-popover">
          <div class="resume-detail-row">
            <span>页面占比</span>
            <strong>{{ percent(resumeDraft.quality.pageUsageRatio) }}</strong>
            <small>目标 92%</small>
          </div>
          <div class="resume-detail-row">
            <span>最低尾行</span>
            <strong>{{ percent(resumeDraft.quality.minimumBulletTailRatio) }}</strong>
            <small>目标 ≥ 75%</small>
          </div>
          <div class="resume-detail-row">
            <span>事实完整性</span>
            <strong>{{ factLabel(resumeDraft.quality.factIntegrity) }}</strong>
          </div>
          <div class="resume-detail-row">
            <span>JD 覆盖</span>
            <strong v-if="resumeDraft.quality.jdCoverage">
              {{ resumeDraft.quality.jdCoverage.covered }}/{{ resumeDraft.quality.jdCoverage.total }}
            </strong>
            <strong v-else>未关联 JD</strong>
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
        <span>预览</span>
      </button>
      <template v-if="platform !== 'darwin'">
        <IconButton :icon="Minus" label="最小化" @click="$emit('minimize')" />
        <IconButton :icon="Maximize2" label="最大化" @click="$emit('maximize')" />
        <IconButton :icon="X" label="关闭" @click="$emit('close')" />
      </template>
    </div>
  </header>
</template>
