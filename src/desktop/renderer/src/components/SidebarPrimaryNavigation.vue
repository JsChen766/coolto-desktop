<script setup lang="ts">
import {
  Archive,
  BriefcaseBusiness,
  Bot,
  FolderOpen,
  Library,
  SquarePen,
} from "@lucide/vue";

defineProps<{
  activeView: "chat" | "agent_tasks" | "experiences" | "library" | "tracker" | "material";
  generating: boolean;
}>();
defineEmits<{
  create: [];
  openAgentTasks: [];
  openExperiences: [];
  openLibrary: [];
  openMaterial: [];
  openTracker: [];
}>();
</script>

<template>
  <nav class="sidebar-primary-navigation" :aria-label="$t('主要功能')">
    <button
      class="new-chat-button icon-label"
      data-testid="sidebar-new-chat"
      type="button"
      :disabled="generating"
      :title="generating ? $t('正在生成中，完成或停止后再切换') : undefined"
      @click="$emit('create')"
    >
      <SquarePen :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('新对话') }}</span>
    </button>
    <button
      class="new-chat-button icon-label"
      :class="{ active: activeView === 'agent_tasks' }"
      type="button"
      :disabled="generating"
      :title="generating ? $t('正在生成中，完成或停止后再切换') : undefined"
      @click="$emit('openAgentTasks')"
    >
      <Bot :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('Agent 任务') }}</span>
    </button>
    <button
      class="new-chat-button icon-label"
      :class="{ active: activeView === 'experiences' }"
      type="button"
      :disabled="generating"
      :title="generating ? $t('正在生成中，完成或停止后再切换') : undefined"
      @click="$emit('openExperiences')"
    >
      <Library :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('经历仓库') }}</span>
    </button>
    <button
      class="new-chat-button icon-label"
      :class="{ active: activeView === 'library' }"
      type="button"
      :disabled="generating"
      :title="generating ? $t('正在生成中，完成或停止后再切换') : undefined"
      @click="$emit('openLibrary')"
    >
      <FolderOpen :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('求职仓库') }}</span>
    </button>
    <button
      class="new-chat-button icon-label"
      :class="{ active: activeView === 'material' }"
      type="button"
      :disabled="generating"
      :title="generating ? $t('正在生成中，完成或停止后再切换') : undefined"
      @click="$emit('openMaterial')"
    >
      <Archive :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('材料库') }}</span>
    </button>
    <button
      class="new-chat-button icon-label"
      :class="{ active: activeView === 'tracker' }"
      type="button"
      :disabled="generating"
      :title="generating ? $t('正在生成中，完成或停止后再切换') : undefined"
      @click="$emit('openTracker')"
    >
      <BriefcaseBusiness :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('投递追踪') }}</span>
    </button>
  </nav>
</template>
