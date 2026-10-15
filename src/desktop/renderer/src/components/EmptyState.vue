<script setup lang="ts">
import {
  ArrowRight,
  ClipboardPaste,
  FileText,
  FileUp,
  FolderOpen,
  Globe,
  Link2,
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
  draftPrompt: [prompt: string];
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
  draft?: string;
  action?: "experiences" | "library" | "tracker" | "browser" | "import" | "delivery";
  primary?: boolean;
};

const stageSuggestions: Record<EmptyStateStage, Suggestion[]> = {
  experience_intake: [
    {
      icon: FileUp,
      title: "上传简历或成果文件",
      action: "import",
      draft: "请把这份材料尽可能完整地沉淀到经历仓库，保留全部数字、关键产出和逻辑链。",
      primary: true,
    },
    {
      icon: Link2,
      title: "粘贴网页链接",
      draft: "这是与我某段经历相关的网页链接，请把内容尽可能完整地沉淀到经历仓库，保留全部数字、关键产出和逻辑链：",
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
      icon: Link2,
      title: "粘贴岗位网页链接",
      draft: "请抓取这个公开岗位链接并保存为 JD：",
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
      icon: Globe,
      title: "浏览求职网站",
      action: "browser",
    },
    {
      icon: FolderOpen,
      title: "管理岗位与简历",
      action: "library",
    },
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

const suggestions = computed(() => stageSuggestions[props.stage]);

const stageCopy: Record<EmptyStateStage, { title: string; description: string }> = {
  experience_intake: {
    title: "先建立你的专属经历仓库",
    description:
      "上传简历、文章或成果文件，也可以粘贴网页链接；可核验的求职事实会自动汇入经历仓库。",
  },
  general_resume: {
    title: "把真实经历整理成通用简历",
    description:
      "你可以继续补充成果或上传材料；准备好后，我会从经历仓库中选择最能体现能力和影响力的内容，生成一份不关联任何 JD 的一页通用简历。",
  },
  job_target: {
    title: "添加你的目标岗位",
    description: "粘贴目标岗位 JD 或公开岗位链接，也可以先浏览求职网站。",
  },
  application: {
    title: "选择投递材料并开始投递",
    description: "可以使用用户源文件、通用简历或针对性简历；用户源文件不受岗位相关性限制。",
  },
  active_search: {
    title: "今天想完成什么？",
    description: "",
  },
};

function run(item: Suggestion): void {
  if (item.action === "experiences") emit("openExperiences");
  else if (item.action === "library") emit("openLibrary");
  else if (item.action === "tracker") emit("openTracker");
  else if (item.action === "browser") emit("openBrowser");
  else if (item.action === "import") emit("importResume");
  else if (item.action === "delivery") emit("saveDeliveryResume");
  if (item.draft) emit("draftPrompt", item.draft);
  else if (item.prompt) emit("usePrompt", item.prompt);
}
</script>

<template>
  <div class="empty-state">
    <div class="empty-symbol" aria-hidden="true">
      <Sparkles :size="25" :stroke-width="1.55" />
    </div>
    <h1>{{ $t(stageCopy[stage].title) }}</h1>
    <p v-if="stageCopy[stage].description">{{ $t(stageCopy[stage].description) }}</p>
    <div
      class="suggestion-list"
      :class="{ 'is-three-column': stage === 'active_search' }"
    >
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
