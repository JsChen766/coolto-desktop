import { createApp } from "vue";

import type {
  AgentTaskDetailView,
  AgentTaskView,
  ApplicationRecord,
  ApplicationReferenceOptions,
  ApplicationTrackerDetail,
  DesktopApi,
  DesktopApprovalRequest,
  SubmissionReceiptView,
} from "@desktop/types";
import AgentTasksView from "../agent-tasks/AgentTasksView.vue";
import ChatPendingAction from "../app/ChatPendingAction.vue";
import ApplicationDetailPanel from "../components/ApplicationDetailPanel.vue";
import MailConnectionsSettings from "../components/MailConnectionsSettings.vue";
import { initializeLocale, localeCode, translate, translateFormat } from "../i18n/locale";
import "../styles/tokens.css";
import "../styles/base.css";

const now = new Date().toISOString();
const task: AgentTaskView = {
  id: "task-qa", conversationId: "conversation-qa",
  goal: "寻找香港后端工程师岗位，匹配度至少 80%",
  status: "running", waitingReason: null, activeRunId: "run-qa",
  grantId: "grant-qa", createdAt: now, updatedAt: now, terminalAt: null,
};
let detail: AgentTaskDetailView = {
  task,
  grant: {
    id: "grant-qa", allowedDomains: ["jobs.example", "careers.example"],
    blockedDomains: [],
    allowedActions: ["browser.read", "browser.control", "browser.write"],
    unattended: true, expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    revokedAt: null,
  },
  receipts: [{
    id: "receipt-qa", toolName: "browser_navigate", status: "succeeded",
    targetOrigin: "https://jobs.example", errorCode: null,
    evidenceCount: 1, createdAt: now,
  }],
  activity: [{
    id: "activity-qa", kind: "policy", title: "grant_allowed",
    detail: "browser_navigate", status: "allow", occurredAt: now,
  }],
  leads: [{
    id: "lead-qa", company: "Acme", role: "Backend Engineer",
    location: "Hong Kong", targetUrl: "https://jobs.example/lead-qa",
    state: "new", score: 86, shortlisted: true,
    rationale: "Matches backend stack and location",
  }],
};

const agentTasks: DesktopApi["agentTasks"] = {
  list: async () => [detail.task],
  get: async () => structuredClone(detail),
  prepare: async () => { throw new Error("not used"); },
  executeProposal: async () => structuredClone(detail),
  start: async () => structuredClone(detail),
  resume: async () => {
    detail = { ...detail, task: { ...detail.task, status: "running" } };
    return structuredClone(detail);
  },
  pause: async () => {
    detail = { ...detail, task: { ...detail.task, status: "paused" } };
    return structuredClone(detail);
  },
  cancel: async () => {
    detail = { ...detail, task: { ...detail.task, status: "canceled" } };
    return structuredClone(detail);
  },
  revoke: async () => {
    detail = { ...detail, grant: detail.grant
      ? { ...detail.grant, revokedAt: new Date().toISOString() } : null };
    return structuredClone(detail);
  },
  submissionReceipt: async () => undefined,
};
const api = {
  agentTasks,
  mailConnections: {
    providers: async () => [
      { provider: "gmail", configured: true, requiredReadScope: "gmail.readonly", sendPermissionRequested: false },
      { provider: "outlook", configured: true, requiredReadScope: "Mail.Read", sendPermissionRequested: false },
    ],
    list: async () => [{
      id: "gmail-qa", provider: "gmail", accountEmail: "qa@example.com",
      scopes: ["gmail.readonly"], connectedAt: now,
    }],
    connect: async () => { throw new Error("not used"); },
    disconnect: async () => undefined,
  },
  browser: { open: async () => ({ isOpen: true }) },
  shell: { openExternal: async () => undefined },
} as unknown as DesktopApi;

initializeLocale();
const answerApproval: DesktopApprovalRequest = {
  id: "approval-answer-qa",
  actionType: "answer_vault.upsert",
  risk: "sensitive",
  title: "保存到 Answer Vault",
  description: "仅在你接受后，将这条常用求职事实写入本机加密存储。",
  preview: {
    summary: [
      { label: "问题", value: "Are you authorized to work in Canada?" },
      { label: "答案", value: "Yes" },
      { label: "适用站点", value: "jobs.example" },
    ],
    warnings: ["接受前不会写入。"],
  },
  createdAt: now,
};
const approvalApp = createApp(ChatPendingAction, {
  request: answerApproval, busy: false,
});
approvalApp.config.globalProperties.$t = translate;
approvalApp.config.globalProperties.$locale = localeCode;
approvalApp.config.globalProperties.$tf = translateFormat;
approvalApp.mount("#approval-qa");
const strategyApp = createApp(ChatPendingAction, {
  request: {
    id: "approval-resume-strategy-qa",
    actionType: "resume.strategy.choose",
    risk: "write",
    title: "这份岗位暂时无法生成可信的针对性简历",
    description:
      "现有经历与这个岗位的匹配度太低，继续改写容易产生弱相关或空泛内容。你可以直接使用通用简历继续投递，或者不继续投递这个岗位。",
    preview: { summary: [] },
    createdAt: now,
  },
  busy: false,
});
strategyApp.config.globalProperties.$t = translate;
strategyApp.config.globalProperties.$locale = localeCode;
strategyApp.config.globalProperties.$tf = translateFormat;
strategyApp.mount("#resume-strategy-qa");
const application: ApplicationRecord = {
  id: "application-qa", jdId: "jd-qa", resumeId: "resume-qa",
  companyName: "Acme", roleName: "Backend Engineer",
  jdTitleSnapshot: "Backend Engineer", resumeTitleSnapshot: "Backend Resume",
  resumeContentHashSnapshot: "b".repeat(64), deliveryMethod: "form_fill",
  targetUrl: "https://jobs.example/apply", appliedAt: now, status: "applied",
  pendingConfirmation: false, source: "browser", dedupeKey: "dedupe-qa",
  companyBusiness: null, roleSummary: null, companyCulture: null,
  rejectionReason: null, entityVersion: 1, createdAt: now, updatedAt: now,
  deletedAt: null, syncStatus: "pending",
};
const references: ApplicationReferenceOptions = { jds: [], resumes: [] };
const trackerDetail: ApplicationTrackerDetail = {
  statusEvents: [], interviews: [], notes: [], reminders: [],
};
const receipt: SubmissionReceiptView = {
  id: "submission-qa", jdId: "jd-qa", resumeId: "resume-qa",
  resumeContentHash: "b".repeat(64), company: "Acme",
  role: "Backend Engineer", targetUrl: "https://jobs.example/apply",
  siteApplicationId: null, status: "confirmed", createdAt: now,
};
const receiptApp = createApp(ApplicationDetailPanel, {
  application, references, detail: trackerDetail, submissionReceipt: receipt,
});
receiptApp.config.globalProperties.$t = translate;
receiptApp.config.globalProperties.$locale = localeCode;
receiptApp.config.globalProperties.$tf = translateFormat;
receiptApp.mount("#receipt-qa");
const mailSettingsApp = createApp(MailConnectionsSettings, { api });
mailSettingsApp.config.globalProperties.$t = translate;
mailSettingsApp.config.globalProperties.$locale = localeCode;
mailSettingsApp.config.globalProperties.$tf = translateFormat;
mailSettingsApp.mount("#mail-settings-qa");
const app = createApp(AgentTasksView, { api });
app.config.globalProperties.$t = translate;
app.config.globalProperties.$locale = localeCode;
app.config.globalProperties.$tf = translateFormat;
app.mount("#app");
