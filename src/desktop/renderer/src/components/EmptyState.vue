<script setup lang="ts">
import {
  ArrowRight,
  ClipboardPaste,
  FilePlus2,
  FileText,
  FileUp,
  Globe,
  ListChecks,
  MessageSquareText,
  Send,
  Sparkles,
} from "@lucide/vue";
import { computed } from "vue";

import type { EmptyStateStage } from "../app/use-empty-state-stages";

const props = defineProps<{ stage: EmptyStateStage }>();

const emit = defineEmits<{
  usePrompt: [prompt: string];
  openExperiences: [];
  openLibrary: [];
  openTracker: [];
  openBrowser: [];
  importResume: [];
}>();

type Suggestion = {
  icon: typeof FileText;
  title: string;
  prompt?: string;
  action?: "experiences" | "library" | "tracker" | "browser" | "import";
};

const stageSuggestions: Record<EmptyStateStage, Suggestion[]> = {
  1: [
    {
      icon: FilePlus2,
      title: "添加你的第一条工作经历",
      action: "experiences",
    },
    {
      icon: FileUp,
      title: "导入简历文件",
      action: "import",
    },
  ],
  2: [
    {
      icon: ClipboardPaste,
      title: "粘贴目标岗位 JD",
      prompt: "请帮我保存一个新的岗位目标：",
    },
    {
      icon: Globe,
      title: "浏览求职网站",
      action: "browser",
    },
  ],
  3: [
    {
      icon: FileText,
      title: "生成针对性简历",
      action: "library",
    },
    {
      icon: Send,
      title: "开始投递这个岗位",
      action: "tracker",
    },
  ],
  4: [
    {
      icon: ListChecks,
      title: "查看投递进度",
      action: "tracker",
    },
    {
      icon: MessageSquareText,
      title: "准备面试问题",
      prompt: "请根据我的经历和目标岗位，帮我准备面试问题。",
    },
  ],
};

const genericSuggestions: Suggestion[] = [
  {
    icon: FileText,
    title: "整理我的经历",
    prompt: "请读取我的经历，并帮我找出最值得写进简历的内容。",
  },
  {
    icon: Sparkles,
    title: "生成自我介绍",
    prompt: "请根据我的全部经历，写一段简洁有力的自我介绍。",
  },
];

const suggestions = computed(() => [
  ...stageSuggestions[props.stage],
  ...genericSuggestions,
]);

function run(item: Suggestion): void {
  if (item.prompt) {
    emit("usePrompt", item.prompt);
    return;
  }
  if (item.action === "experiences") emit("openExperiences");
  else if (item.action === "library") emit("openLibrary");
  else if (item.action === "tracker") emit("openTracker");
  else if (item.action === "browser") emit("openBrowser");
  else if (item.action === "import") emit("importResume");
}
</script>

<template>
  <div class="empty-state">
    <div class="empty-symbol" aria-hidden="true">
      <Sparkles :size="25" :stroke-width="1.55" />
    </div>
    <h1>{{ $t('今天想完成什么？') }}</h1>
    <p>{{ $t('我可以读取你的经历，并帮助你准备求职材料。') }}</p>
    <div class="suggestion-list">
      <button
        v-for="item in suggestions"
        :key="item.title"
        class="suggestion-card"
        type="button"
        @click="run(item)"
      >
        <component
          :is="item.icon"
          :size="16"
          :stroke-width="1.7"
          aria-hidden="true"
        />
        <span>{{ $t(item.title) }}</span>
        <ArrowRight
          class="suggestion-arrow"
          :size="15"
          :stroke-width="1.7"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>
