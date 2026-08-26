<script setup lang="ts">
import {
  ArrowLeft,
  FileClock,
  FileText,
  GripVertical,
  LoaderCircle,
} from "@lucide/vue";
import { computed, ref } from "vue";

import type {
  ResumeDraftDetail,
  ResumeDraftEditInput,
  ResumeDraftRestoreInput,
} from "@desktop/types";
import { translate } from "../i18n/locale";
import A4ResumeEditor from "./A4ResumeEditor.vue";
import IconButton from "./IconButton.vue";
import { resumeDraftProgressLabel } from
  "../resume-workspace/resume-draft-status";

const props = defineProps<{
  draft?: ResumeDraftDetail | undefined;
  busy?: boolean;
  error?: string | undefined;
  localSaveState: "idle" | "dirty" | "saving" | "saved" | "error";
  repositoryPreview?: boolean;
}>();

defineEmits<{
  edit: [input: ResumeDraftEditInput];
  autosave: [input: ResumeDraftEditInput];
  restore: [input: ResumeDraftRestoreInput];
  accept: [];
  reject: [];
  back: [];
}>();

const historyOpen = ref(false);

const localState = computed(() => {
  if (props.localSaveState === "saving") return translate("正在保存到本地…");
  if (props.localSaveState === "dirty") return translate("有尚未自动保存的修改");
  if (props.localSaveState === "error") return translate("本地保存失败");
  if (!props.draft) return "";
  const progress = resumeDraftProgressLabel({
    workspaceStatus: props.draft.workspaceStatus,
    generationReady: props.draft.generationReadiness.ready,
  });
  if (progress) return `${progress} · ${translate("已自动保存到本地")}`;
  if (props.draft.cloudState === "local_changes") {
    return translate("已自动保存到本地 · 尚未保存到简历库");
  }
  if (props.draft.cloudState === "synced") return translate("已自动保存到本地 · 已加入简历库");
  return translate("已自动保存到本地");
});
</script>

<template>
  <aside
    class="artifact-panel"
    data-testid="resume-draft-status"
    :data-artifact-id="draft?.artifactId ?? ''"
    :data-revision="draft?.revision ?? ''"
    :data-workspace-status="draft?.workspaceStatus ?? ''"
    :data-page-count="draft?.compileResult.pageCount ?? ''"
    :data-page-usage-ratio="draft?.compileResult.usageRatio ?? ''"
    :data-generation-ready="draft ? String(draft.generationReadiness.ready) : ''"
    :data-blocker-codes="draft?.generationReadiness.blockers.map((item) => item.code).join(',') ?? ''"
  >
    <header class="artifact-header">
      <div class="artifact-title-wrap">
        <button
          v-if="repositoryPreview"
          class="artifact-back-button icon-label"
          type="button"
          @click="$emit('back')"
        >
          <ArrowLeft :size="15" :stroke-width="1.8" aria-hidden="true" />
          {{ $t('返回求职仓库') }}
        </button>
        <div class="artifact-title icon-label">
          <FileText :size="16" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ draft?.title ?? $t('简历预览') }}</span>
        </div>
        <span v-if="draft" class="artifact-local-state">{{ localState }}</span>
      </div>
      <IconButton
        :icon="FileClock"
        :label="$t('本地版本')"
        :active="historyOpen"
        :disabled="!draft"
        @click="historyOpen = !historyOpen"
      />
    </header>

    <div v-if="error" class="artifact-error">{{ error }}</div>

    <div v-if="busy && !draft" class="artifact-loading">
      <LoaderCircle class="spin" :size="20" :stroke-width="1.8" />
      <span>{{ $t('正在打开本地简历…') }}</span>
    </div>

    <template v-else-if="draft">
      <div v-if="historyOpen" class="resume-history-panel">
        <div class="resume-history-heading">
          <strong>{{ $t('本地版本') }}</strong>
          <span>{{ $t('恢复不会写入云端') }}</span>
        </div>
        <button
          v-for="checkpoint in [...draft.checkpoints].reverse()"
          :key="checkpoint.id"
          class="resume-history-row"
          type="button"
          @click="
            $emit('restore', {
              artifactId: draft.artifactId,
              checkpointId: checkpoint.id,
            })
          "
        >
          <span>
            <strong>{{ checkpoint.label }}</strong>
            <small>{{ $tf('本地修订 {revision}', { revision: checkpoint.revision }) }}</small>
          </span>
          <time>{{ new Date(checkpoint.createdAt).toLocaleString($locale()) }}</time>
        </button>
        <p v-if="draft.checkpoints.length === 0" class="resume-history-empty">
          {{ $t('暂无本地版本') }}
        </p>
      </div>

      <div class="resume-drag-instruction">
        <GripVertical :size="14" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t('悬停要点或经历，拖动左侧手柄到聊天；点击手柄也可直接引用') }}</span>
      </div>

      <A4ResumeEditor
        :draft="draft"
        @edit="$emit('edit', $event)"
        @autosave="$emit('autosave', $event)"
      />

      <footer v-if="draft.pendingChange" class="resume-change-actions">
        <div>
          <strong>{{ draft.pendingChange.summary }}</strong>
          <span>{{ $t('修改尚未合并到本地工作稿') }}</span>
        </div>
        <div class="resume-change-buttons">
          <button type="button" @click="$emit('reject')">{{ $t('拒绝') }}</button>
          <button class="resume-accept-button" type="button" @click="$emit('accept')">
            {{ $t('接受') }}
          </button>
        </div>
      </footer>
    </template>

    <div v-else class="artifact-canvas">
      <div class="paper-preview">
        <div class="paper-placeholder">
          <FileText :size="24" :stroke-width="1.4" aria-hidden="true" />
          <strong>{{ $t('还没有简历草稿') }}</strong>
          <span>{{ $t('生成简历后会自动保存到本机，并在这里显示真实 A4 预览。') }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>
