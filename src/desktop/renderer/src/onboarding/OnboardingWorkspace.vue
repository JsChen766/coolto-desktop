<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { JobRepositoryNavigationState } from
  "../job-assets/job-repository-navigation";
import type { AppShell } from "../app/use-app-shell";
import AppChatWorkspace from "../app/AppChatWorkspace.vue";
import ApplicationTrackerView from "../components/ApplicationTrackerView.vue";
import ExperienceLibraryView from "../components/ExperienceLibraryView.vue";
import JobRepositoryView from "../components/JobRepositoryView.vue";
import OnboardingGuideBar from "./OnboardingGuideBar.vue";
import type { OnboardingController } from "./use-onboarding";
import { SAMPLE_JD_ID } from "./onboarding-sample-api";
import { translate } from "../i18n/locale";

const props = defineProps<{
  shell: AppShell;
  controller: OnboardingController;
}>();

const experienceSeen = ref(false);
const applicationSeen = ref(false);
const composerFocused = ref(false);
const navigation = ref<JobRepositoryNavigationState>({
  view: "jobs",
  query: "",
  jobFilter: "",
  resumeFilter: "",
  selectedJdId: SAMPLE_JD_ID,
  selectedResumeId: null,
  detailOpen: true,
});

const step = computed(() => props.controller.status.value?.step);
const stepIndex = computed(() => {
  if (step.value === "welcome") return 1;
  if (step.value === "experience") return 2;
  if (step.value === "resume") return 3;
  if (step.value === "browser" || step.value === "browser_review") return 4;
  return 5;
});

watch(step, (next) => {
  if (next === "experience") experienceSeen.value = false;
  if (next === "tracker") applicationSeen.value = false;
});

const guide = computed(() => {
  switch (step.value) {
    case "welcome": return {
      title: composerFocused.value
        ? "示例指令正在填入聊天框"
        : "先从聊天框开始使用 Coolto",
      description: composerFocused.value
        ? "文字填写完成后，请点击输入框右下角的真实发送按钮。"
        : "Coolto 的核心使用方式是从聊天框告诉 Agent 你想做什么；请点击下方输入框。",
      action: undefined,
    };
    case "experience": return {
      title: "在真实经历仓库查看长期事实",
      description: experienceSeen.value
        ? "你看到的是可被不同 JD 和简历复用的结构化事实。"
        : "请先点击任意一条示例经历，查看职责、方法和成果。",
      action: experienceSeen.value ? "同意继续到示例岗位" : undefined,
    };
    case "resume": return {
      title: "从真实求职仓库准备岗位简历",
      description: "点击 Nova Labs 示例 JD 中的“准备岗位简历”。固定结果不会调用模型。",
      action: undefined,
    };
    case "browser": return {
      title: "固定测试简历已显示在真实 A4 工作区",
      description: "下一步将打开真实 Browser Shell 的本地测试申请页。",
      action: "同意打开并填写测试页面",
    };
    case "browser_review": return {
      title: "请在 Browser Shell 中检查填写结果",
      description: "使用页内真实审核控件接受或拒绝；完成后 App 会自动进入投递追踪。",
      action: undefined,
      secondary: "重新打开测试页面",
    };
    case "tracker": return {
      title: "在真实投递追踪中查看刚才的记录",
      description: applicationSeen.value
        ? "以后可以在这里使用看板、时间轴和 App 内日历追踪进度。"
        : "请点击 Nova Labs 示例投递卡片查看详情；本引导不展示邮箱扫描。",
      action: applicationSeen.value ? "我已经了解投递追踪" : undefined,
    };
    case "complete": return {
      title: "全流程体验完成",
      description: "确认后立即清理全部示例数据和临时文件，只保留这条引导对话。",
      action: "清理示例并完成体验",
    };
    default: return { title: "正在准备一次性体验", description: "请稍候。" };
  }
});

async function primaryAction(): Promise<void> {
  if (step.value === "experience" && experienceSeen.value) {
    await props.controller.advance("view_sample_experience");
  } else if (step.value === "browser") {
    await props.controller.openBrowserDemo();
  } else if (step.value === "tracker" && applicationSeen.value) {
    await props.controller.advance("view_sample_application");
  } else if (step.value === "complete") {
    await props.controller.complete();
  }
}

async function sendGuidedPrompt(): Promise<void> {
  if (step.value === "welcome") {
    await props.controller.advance("accept_sample_profile");
  }
}

const guidedPrompt = computed(() => composerFocused.value
  ? translate("请使用准备好的示例资料，带我体验如何保存经历、根据 JD 生成简历并追踪投递。")
  : undefined);

async function generateResume(
  action: "generate" | "match",
  jdId: string,
): Promise<void> {
  if (action === "generate" && jdId === SAMPLE_JD_ID) {
    await props.controller.advance("generate_sample_resume");
  }
}
</script>

<template>
  <main class="main-workspace onboarding-workspace">
    <div v-if="controller.checking.value" class="onboarding-page-state">
      <span class="boot-pulse" aria-hidden="true" />
      <strong>{{ $t('正在准备一次性示例体验…') }}</strong>
    </div>
    <div v-else-if="controller.error.value && !controller.active.value" class="onboarding-page-state" role="alert">
      <strong>{{ $t('首次体验暂时无法启动') }}</strong>
      <span>{{ controller.error.value }}</span>
      <button class="primary-button" type="button" @click="controller.retry">{{ $t('重试') }}</button>
    </div>
    <template v-else>
      <ExperienceLibraryView
        v-if="step === 'experience'"
        :import-focus="undefined"
        @selected="experienceSeen = true"
        @toggle-sidebar="shell.showSidebar"
      />
      <JobRepositoryView
        v-else-if="step === 'resume'"
        :navigation="navigation"
        @navigate="navigation = $event"
        @agent="generateResume"
        @toggle-sidebar="shell.showSidebar"
      />
      <ApplicationTrackerView
        v-else-if="step === 'tracker' || step === 'complete'"
        :context="{}"
        @application-opened="applicationSeen = true"
      />
      <AppChatWorkspace
        v-else
        :shell="shell"
        :composer-disabled="step !== 'welcome'"
        :composer-guided="step === 'welcome'"
        :composer-guided-text="guidedPrompt"
        :composer-guided-highlight="step === 'welcome'"
        @composer-focus="composerFocused = true"
        @composer-send="sendGuidedPrompt"
      />
      <OnboardingGuideBar
        v-if="step && step !== 'completed'"
        :index="stepIndex"
        :title="guide.title"
        :description="guide.description"
        :action-label="guide.action"
        :secondary-label="guide.secondary"
        :busy="controller.busy.value"
        :error="controller.error.value"
        :above-composer="step === 'welcome'"
        @action="primaryAction"
        @secondary="controller.reopenBrowserDemo"
      />
    </template>
  </main>
</template>

<style scoped>
.onboarding-workspace { position: relative; min-width: 0; overflow: hidden; }
.onboarding-page-state {
  display: grid;
  height: 100%;
  place-content: center;
  justify-items: center;
  gap: 10px;
  padding: 28px;
  color: var(--text-soft);
  text-align: center;
}
.onboarding-page-state strong { color: var(--text); }
</style>
