<script setup lang="ts">
import {
  BriefcaseBusiness,
  FolderOpen,
  Library,
  SquarePen,
} from "@lucide/vue";

defineProps<{ activeView: "chat" | "experiences" | "library" | "tracker" }>();
defineEmits<{
  create: [];
  openExperiences: [];
  openLibrary: [];
  openTracker: [];
}>();
</script>

<template>
  <nav class="sidebar-primary-navigation" :aria-label="$t('主要功能')">
    <button class="new-chat-button icon-label" type="button" @click="$emit('create')">
      <SquarePen :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('新对话') }}</span>
    </button>
    <button
      class="new-chat-button icon-label"
      :class="{ active: activeView === 'experiences' }"
      type="button"
      @click="$emit('openExperiences')"
    >
      <Library :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('经历仓库') }}</span>
    </button>
    <button
      class="new-chat-button icon-label"
      :class="{ active: activeView === 'library' }"
      type="button"
      @click="$emit('openLibrary')"
    >
      <FolderOpen :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('求职仓库') }}</span>
    </button>
    <button
      class="new-chat-button icon-label"
      :class="{ active: activeView === 'tracker' }"
      type="button"
      @click="$emit('openTracker')"
    >
      <BriefcaseBusiness :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ $t('投递追踪') }}</span>
    </button>
  </nav>
</template>
