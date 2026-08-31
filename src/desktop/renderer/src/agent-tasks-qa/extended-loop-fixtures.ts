import { createApp, type Component } from "vue";
import type { ApplicationRecord, DesktopApi, InterviewRound } from "@desktop/types";
import ApplicationLoopDialog from "../agent-tasks/ApplicationLoopDialog.vue";
import GlobalAiLoopDialog from "../agent-tasks/GlobalAiLoopDialog.vue";
import { localeCode, translate, translateFormat } from "../i18n/locale";

export function mountExtendedLoopFixtures(input: {
  api: DesktopApi; application: ApplicationRecord; interview: InterviewRound;
}): void {
  mount(ApplicationLoopDialog, "#follow-up-loop-qa", {
    api: input.api, conversationId: "conversation-qa", application: input.application,
    interviews: [input.interview], kind: "follow_up",
  });
  mount(ApplicationLoopDialog, "#briefing-loop-qa", {
    api: input.api, conversationId: "conversation-qa", application: input.application,
    interviews: [input.interview], kind: "briefing",
  });
  mount(GlobalAiLoopDialog, "#strategy-loop-qa", {
    api: input.api, conversationId: "conversation-qa", connections: [], kind: "strategy",
  });
  mount(GlobalAiLoopDialog, "#risk-loop-qa", {
    api: input.api, conversationId: "conversation-qa",
    connections: [{
      id: "gmail-qa", provider: "gmail", accountEmail: "qa@example.com",
      scopes: ["gmail.readonly"], connectedAt: new Date().toISOString(),
    }], kind: "risk",
  });
}

function mount(component: Component, selector: string, props: Record<string, unknown>): void {
  const app = createApp(component, props);
  app.config.globalProperties.$t = translate;
  app.config.globalProperties.$locale = localeCode;
  app.config.globalProperties.$tf = translateFormat;
  app.mount(selector);
}
