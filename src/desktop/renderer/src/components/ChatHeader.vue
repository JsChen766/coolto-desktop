<script setup lang="ts">
import {
  FileText,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "@lucide/vue";

import type { DesktopPlatform } from "@desktop/types";
import IconButton from "./IconButton.vue";

defineProps<{
  title: string;
  sidebarOpen: boolean;
  artifactOpen: boolean;
  platform: DesktopPlatform;
}>();

defineEmits<{
  toggleSidebar: [];
  toggleArtifact: [];
  rename: [];
  minimize: [];
  maximize: [];
  close: [];
}>();
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
