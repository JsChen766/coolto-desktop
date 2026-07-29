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
import A4ResumeEditor from "./A4ResumeEditor.vue";
import IconButton from "./IconButton.vue";

const props = defineProps<{
  draft?: ResumeDraftDetail | undefined;
  busy?: boolean;
  error?: string | undefined;
  localSaveState: "idle" | "saving" | "saved" | "error";
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
  if (props.localSaveState === "saving") return "正在保存到本地…";
  if (props.localSaveState === "error") return "本地保存失败";
  if (!props.draft) return "";
  if (props.draft.cloudState === "local_changes") {
    return "已保存到本地 · 有未同步修改";
  }
  if (props.draft.cloudState === "synced") return "已保存到本地和云端";
  return "已自动保存到本地";
});
</script>

<template>
  <aside class="artifact-panel">
    <header class="artifact-header">
      <div class="artifact-title-wrap">
        <button
          v-if="repositoryPreview"
          class="artifact-back-button icon-label"
          type="button"
          @click="$emit('back')"
        >
          <ArrowLeft :size="15" :stroke-width="1.8" aria-hidden="true" />
          返回求职仓库
        </button>
        <div class="artifact-title icon-label">
          <FileText :size="16" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ draft?.title ?? "简历预览" }}</span>
        </div>
        <span v-if="draft" class="artifact-local-state">{{ localState }}</span>
      </div>
      <IconButton
        :icon="FileClock"
        label="本地版本"
        :active="historyOpen"
        :disabled="!draft"
        @click="historyOpen = !historyOpen"
      />
    </header>

    <div v-if="error" class="artifact-error">{{ error }}</div>

    <div v-if="busy && !draft" class="artifact-loading">
      <LoaderCircle class="spin" :size="20" :stroke-width="1.8" />
      <span>正在打开本地简历…</span>
    </div>

    <template v-else-if="draft">
      <div v-if="historyOpen" class="resume-history-panel">
        <div class="resume-history-heading">
          <strong>本地版本</strong>
          <span>恢复不会写入云端</span>
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
            <small>本地修订 {{ checkpoint.revision }}</small>
          </span>
          <time>{{ new Date(checkpoint.createdAt).toLocaleString('zh-CN') }}</time>
        </button>
        <p v-if="draft.checkpoints.length === 0" class="resume-history-empty">
          暂无本地版本
        </p>
      </div>

      <div class="resume-drag-instruction">
        <GripVertical :size="14" :stroke-width="1.8" aria-hidden="true" />
        <span>悬停要点或经历，拖动左侧手柄到聊天；点击手柄也可直接引用</span>
      </div>

      <A4ResumeEditor
        :draft="draft"
        @edit="$emit('edit', $event)"
        @autosave="$emit('autosave', $event)"
      />

      <footer v-if="draft.pendingChange" class="resume-change-actions">
        <div>
          <strong>{{ draft.pendingChange.summary }}</strong>
          <span>修改尚未合并到本地工作稿</span>
        </div>
        <div class="resume-change-buttons">
          <button type="button" @click="$emit('reject')">拒绝</button>
          <button class="resume-accept-button" type="button" @click="$emit('accept')">
            接受
          </button>
        </div>
      </footer>
    </template>

    <div v-else class="artifact-canvas">
      <div class="paper-preview">
        <div class="paper-placeholder">
          <FileText :size="24" :stroke-width="1.4" aria-hidden="true" />
          <strong>还没有简历草稿</strong>
          <span>生成简历后会自动保存到本机，并在这里显示真实 A4 预览。</span>
        </div>
      </div>
    </div>
  </aside>
</template>
