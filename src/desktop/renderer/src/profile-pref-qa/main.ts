import { createApp, type Component } from "vue";

import type { DesktopApprovalRequest } from "@desktop/types";
import type { MaterialApi } from "@desktop/types/material";
import ChatPendingAction from "../app/ChatPendingAction.vue";
import MaterialLibraryView from "../material/MaterialLibraryView.vue";
import ApplicationQaFixture from "./ApplicationQaFixture.vue";
import ProfilePrefQaApp from "./ProfilePrefQaApp.vue";
import {
  inboxApplicationApprovalRequest,
  inboxInterviewApprovalRequest,
} from "./inbox-approval-fixtures.js";
import { initializeLocale, localeCode, translate, translateFormat } from "../i18n/locale";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/profile-dialog.css";
import "../styles/profile-sync-banner.css";
import "../styles/preference-dialog.css";
import "../styles/tracker-forms.css";

const now = new Date().toISOString();
initializeLocale();

function mount(target: string, component: Component, props: Record<string, unknown>): void {
  const app = createApp(component, props);
  app.config.globalProperties.$t = translate;
  app.config.globalProperties.$locale = localeCode;
  app.config.globalProperties.$tf = translateFormat;
  app.mount(target);
}

const preferenceApproval: DesktopApprovalRequest = {
  id: "approval-preference-qa",
  actionType: "preference.upsert",
  risk: "write",
  title: "确认偏好变更",
  description: "接受后写入本机 Outbox，由同步链路提交。",
  preview: {
    summary: [],
    preference: {
      action: "create",
      key: "resume.tone", currentValue: "—", proposedValue: "restrained",
      scope: "全局", priority: 50, source: "行为建议后确认",
      explanation: "只影响未来任务；历史资产不变。",
    },
  },
  createdAt: now,
};
mount("#approval-pref-qa", ChatPendingAction, { request: preferenceApproval, busy: false });
mount("#approval-inbox-app-qa", ChatPendingAction, {
  request: inboxApplicationApprovalRequest,
  busy: false,
});
mount("#approval-inbox-interview-qa", ChatPendingAction, {
  request: inboxInterviewApprovalRequest,
  busy: false,
});

mount("#application-qa", ApplicationQaFixture, {});

const materialApi: MaterialApi = {
  select: async () => [],
  list: async () => [],
  get: async () => undefined,
  import: async () => { throw new Error("qa"); },
  processOcr: async () => { throw new Error("qa"); },
  confirmOcr: async () => { throw new Error("qa"); },
  prepareRelation: async () => { throw new Error("qa"); },
  approveRelation: async () => { throw new Error("qa"); },
  rejectRelation: async () => undefined,
  previewDelete: async () => { throw new Error("qa"); },
  cancelDelete: async () => undefined,
  confirmDelete: async () => undefined,
  exportPackage: async () => null,
  restorePackage: async () => null,
};
mount("#material-qa", MaterialLibraryView, { api: materialApi });

mount("#app", ProfilePrefQaApp, {});
