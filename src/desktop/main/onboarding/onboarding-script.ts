import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type {
  OnboardingAction,
  OnboardingLocale,
} from "../../shared/types.js";

const INTRO = [
  "欢迎使用 Coolto。",
  "",
  "这是一段只执行一次的产品体验。接下来会使用完全虚构的联系方式、经历、JD、简历和投递记录，带你在真实 App 页面中走完整个流程。",
  "",
  "你不需要输入任何文字；每一步只需确认继续。体验数据不会进入你的正式资产，完成后会立即清理；这条引导对话会保留，方便以后回看。",
].join("\n");

const SCRIPTS: Record<OnboardingAction, readonly [string, string]> = {
  accept_sample_profile: [
    "【示例操作】请使用准备好的示例资料，带我体验如何保存经历、根据 JD 生成简历并追踪投递。",
    "示例身份已经准备好：林小满（示例）、+852 5555 0108、demo@coolto.example、Hong Kong。现在进入真实的经历仓库，查看三条脱敏示例经历如何成为长期资产。",
  ],
  view_sample_experience: [
    "【示例操作】我已经查看了示例经历以及其中保存的职责、方法和成果。",
    "你刚看到的是独立、可复用的经历事实，不是某一份简历的附属内容。接下来进入求职仓库，用 Nova Labs 数据分析师示例 JD 准备一份固定的测试简历。",
  ],
  generate_sample_resume: [
    "【示例操作】请使用示例经历，为 Nova Labs 数据分析师岗位准备测试简历。",
    "固定测试简历已经准备完成。这个结果不会调用大模型，也不会消耗额度；它会通过真实的聊天区和 A4 简历工作区展示。下一步可以用它体验内置浏览器辅助填写。",
  ],
  open_browser_demo: [
    "【示例操作】我同意打开本地测试申请页，并填写示例联系方式和测试简历。",
    "真实 Browser Shell 已打开。页面只存在于本机测试环境；请在浏览器页内检查姓名、邮箱、地点和简历文件，并使用真实审核控件接受或拒绝这些填写结果。",
  ],
  finish_browser_demo: [
    "【示例操作】我已经检查并处理了测试页面中的填写结果。",
    "示例投递已经记录到隔离的 Tracker 数据中。现在进入真实的投递追踪页面，看看以后在哪里查看投递状态、面试、笔记和提醒。这里不会展示或模拟邮箱扫描。",
  ],
  view_sample_application: [
    "【示例操作】我已经在投递追踪中查看了刚才的示例投递。",
    "以后你的真实投递会集中显示在这里，并可通过看板、时间轴和 App 内日历查看。确认完成后，全部示例业务数据和浏览器临时文件都会清理，只保留这条只读引导历史。",
  ],
};

const EN_INTRO = [
  "Welcome to Coolto.",
  "",
  "This one-time product tour uses fully fictional contact details, experiences, a JD, a resume and an application record across the real App screens.",
  "",
  "You do not need to type. Sample data never enters your real assets and will be removed at the end. This guide conversation stays available for reference.",
].join("\n");

const EN_SCRIPTS: Record<OnboardingAction, readonly [string, string]> = {
  accept_sample_profile: [
    "[Sample action] Use the prepared sample data to show me how to save experience, create a resume from a JD, and track an application.",
    "The sample identity is ready: Lin Xiaoman (sample), +852 5555 0108, demo@coolto.example, Hong Kong. Next, open the real experience library to see three fictional experiences as reusable assets.",
  ],
  view_sample_experience: [
    "[Sample action] I reviewed the saved responsibilities, methods and outcomes.",
    "These facts are independent reusable assets, not content owned by one resume. Next, use the fictional Nova Labs Data Analyst JD in the real job repository to prepare a fixed sample resume.",
  ],
  generate_sample_resume: [
    "[Sample action] Prepare a sample resume for the Nova Labs Data Analyst role.",
    "The fixed sample resume is ready. No model was called and no credits were used. It is displayed in the real chat and A4 resume workspace. Next, use it in the built-in browser.",
  ],
  open_browser_demo: [
    "[Sample action] Open the local test application and fill it with the sample contact details and resume.",
    "The real Browser Shell is open. The page exists only on this device. Review the name, email, location and resume with the real in-page controls.",
  ],
  finish_browser_demo: [
    "[Sample action] I reviewed the test-page fill results.",
    "The sample application is now available in isolated Tracker data. Open the real application tracking screen to learn where statuses, interviews, notes and reminders live. Inbox scanning is not shown.",
  ],
  view_sample_application: [
    "[Sample action] I reviewed the sample application in Tracker.",
    "Future applications appear here in the board, timeline and in-app calendar. Finishing removes all sample business data and temporary files while keeping this guide conversation.",
  ],
};

export function onboardingIntroMessage(
  locale: OnboardingLocale,
  timestamp = Date.now(),
): AgentMessage {
  return assistant(locale === "en-US" ? EN_INTRO : INTRO, timestamp);
}

export function onboardingStepMessages(
  action: OnboardingAction,
  firstTimestamp: number,
  locale: OnboardingLocale,
): AgentMessage[] {
  const [userText, assistantText] = (
    locale === "en-US" ? EN_SCRIPTS : SCRIPTS
  )[action];
  return [
    { role: "user", content: userText, timestamp: firstTimestamp },
    assistant(assistantText, firstTimestamp + 1),
  ] as AgentMessage[];
}

export function onboardingCompletedMessages(
  firstTimestamp: number,
  locale: OnboardingLocale,
): AgentMessage[] {
  if (locale === "en-US") return [
    { role: "user", content: "[Sample action] I understand. Finish the tour.", timestamp: firstTimestamp },
    assistant([
      "The one-time tour is complete and all sample data has been removed.", "",
      "You experienced:",
      "- Saving reusable facts in the experience library",
      "- Preparing a resume from a JD",
      "- Using the built-in browser to assist with form filling",
      "- Viewing progress in application tracking", "",
      "Start by adding real experience material. Upload a resume or supporting document, paste a relevant webpage, or tell Coolto about an experience.",
    ].join("\n"), firstTimestamp + 1),
  ] as AgentMessage[];
  return [
    {
      role: "user",
      content: "【示例操作】我知道了，完成这次体验。",
      timestamp: firstTimestamp,
    },
    assistant([
      "一次性体验已完成，示例数据已清理。",
      "",
      "你已经体验了：",
      "- 在经历仓库沉淀长期事实",
      "- 根据 JD 准备岗位简历",
      "- 使用内置浏览器辅助填写",
      "- 在投递追踪中查看进度",
      "",
      "接下来先沉淀真实经历：上传简历或成果文件、粘贴相关网页链接，或者直接告诉 Coolto 一段经历。材料中的数字、关键产出和完整逻辑会自动写入经历仓库。",
    ].join("\n"), firstTimestamp + 1),
  ] as AgentMessage[];
}

function assistant(text: string, timestamp: number): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp,
  } as AgentMessage;
}
