<script setup lang="ts">
import {
  ArrowRight,
  ClipboardPaste,
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
  saveDeliveryResume: [];
}>();

type Suggestion = {
  icon: typeof FileText;
  title: string;
  prompt?: string;
  action?: "experiences" | "library" | "tracker" | "browser" | "import" | "delivery";
  primary?: boolean;
};

const stageSuggestions: Record<EmptyStateStage, Suggestion[]> = {
  experience_intake: [
    {
      icon: FileUp,
      title: "保存现有简历用于投递",
      action: "delivery",
      primary: true,
    },
    {
      icon: FileText,
      title: "导入现有简历中的经历",
      action: "import",
    },
    {
      icon: MessageSquareText,
      title: "直接告诉我一段经历",
      prompt: "我想先告诉你一段经历，请引导我补充职责、方法、成果和可核验事实，并帮我写进经历仓库。",
    },
    {
      icon: ArrowRight,
      title: "稍后再说",
      prompt: "我想稍后再整理经历和生成通用简历。",
    },
  ],
  general_resume: [
    {
      icon: Sparkles,
      title: "生成通用简历",
      prompt: "请基于我的全部经历生成一份不关联任何 JD 的高质量一页通用简历。",
      primary: true,
    },
    {
      icon: MessageSquareText,
      title: "继续补充经历成果",
      prompt: "我想继续补充一段经历中的职责、方法、交付物或成果，请引导我并帮我保存到经历仓库。",
    },
    {
      icon: FileUp,
      title: "继续上传经历材料",
      action: "import",
    },
    {
      icon: ArrowRight,
      title: "稍后再说",
      prompt: "我想稍后再生成通用简历。",
    },
  ],
  job_target: [
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
  application: [
    {
      icon: FileText,
      title: "选择简历并开始投递",
      action: "library",
    },
    {
      icon: Send,
      title: "开始投递这个岗位",
      action: "tracker",
    },
  ],
  active_search: [
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
];

const suggestions = computed(() => [
  ...stageSuggestions[props.stage],
  ...(["experience_intake", "general_resume"].includes(props.stage)
    ? [] : genericSuggestions),
]);

const stageCopy: Record<EmptyStateStage, { title: string; description: string }> = {
  experience_intake: {
    title: "先建立你的专属经历仓库",
    description:
      "已有满意简历时，可以原样保存在本机用于任意岗位投递；需要写简历时，再单独导入经历或告诉我真实成果。",
  },
  general_resume: {
    title: "把真实经历整理成通用简历",
    description:
      "你可以继续补充成果或上传材料；准备好后，我会从经历仓库中选择最能体现能力和影响力的内容，生成一份不关联任何 JD 的一页通用简历。",
  },
  job_target: {
    title: "添加你的目标岗位",
    description: "粘贴目标岗位 JD，或先浏览求职网站，我会继续帮你准备针对性材料。",
  },
  application: {
    title: "选择投递材料并开始投递",
    description: "可以使用用户源文件、通用简历或针对性简历；用户源文件不受岗位相关性限制。",
  },
  active_search: {
    title: "今天想完成什么？",
    description: "我可以读取你的经历，并帮助你准备求职材料。",
  },
};

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
  else if (item.action === "delivery") emit("saveDeliveryResume");
}
</script>

<template>
  <div class="empty-state">
    <div class="empty-symbol" aria-hidden="true">
      <Sparkles :size="25" :stroke-width="1.55" />
    </div>
    <h1>{{ $t(stageCopy[stage].title) }}</h1>
    <p>{{ $t(stageCopy[stage].description) }}</p>
    <div class="suggestion-list">
      <button
        v-for="item in suggestions"
        :key="item.title"
        class="suggestion-card"
        :class="{ 'is-primary': item.primary }"
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
