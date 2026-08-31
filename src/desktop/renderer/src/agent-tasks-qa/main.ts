import { createApp } from "vue";

import type {
  AgentTaskDetailView,
  AgentTaskView,
  ApplicationRecord,
  ApplicationReferenceOptions,
  ApplicationTrackerDetail,
  DesktopApi,
  DesktopApprovalRequest,
  InterviewRound,
  SubmissionReceiptView,
} from "@desktop/types";
import AgentTasksView from "../agent-tasks/AgentTasksView.vue";
import ChatPendingAction from "../app/ChatPendingAction.vue";
import ApplicationDetailPanel from "../components/ApplicationDetailPanel.vue";
import MailConnectionsSettings from "../components/MailConnectionsSettings.vue";
import ResumeJobLoopDialog from "../agent-tasks/ResumeJobLoopDialog.vue";
import { mountExtendedLoopFixtures } from "./extended-loop-fixtures";
import { initializeLocale, localeCode, translate, translateFormat } from "../i18n/locale";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/tracker-forms.css";
import "../styles/tracker-children.css";

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
    loop: { kind: "resume_job_apply", resumeTitle: "Backend Resume", sources: ["Acme"] },
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
  artifacts: [
    { id: "artifact-follow", kind: "follow_up_draft", title: "投递跟进邮件",
      summary: "计划于 2026-09-03 10:00 跟进", applicationId: "application-qa", createdAt: now,
      detail: { body: "您好，我想跟进当前岗位的申请进展。", scheduledFor: now,
        timezone: "Asia/Hong_Kong" } },
    { id: "artifact-brief", kind: "interview_brief", title: "后端工程师面试简报",
      summary: "1 个准备主题", applicationId: "application-qa", createdAt: now,
      detail: { sections: [{ heading: "岗位重点", content: "准备系统设计案例。",
        sourceRefs: ["jd:jd-qa"] }] } },
    { id: "artifact-strategy", kind: "strategy_proposal", title: "本周投递策略建议",
      summary: "优先复盘进入面试阶段的岗位来源", applicationId: null, createdAt: now,
      detail: { recommendations: ["优先复盘高回复来源"],
        caveat: "相关性观察不代表因果关系。" } },
    { id: "artifact-risk", kind: "risk_notice", title: "测评截止时间需复核",
      summary: "邮件提到本周五前完成测评", applicationId: "application-qa", createdAt: now,
      detail: { severity: "review", rationale: "请复核截止时间。",
        evidenceQuotes: ["Complete by Friday"], deadlineAt: null } },
  ],
};

const agentTasks: DesktopApi["agentTasks"] = {
  list: async () => [detail.task],
  get: async () => structuredClone(detail),
  prepare: async () => { throw new Error("not used"); },
  prepareResumeJobLoop: async () => { throw new Error("not used"); },
  prepareMailScheduleLoop: async () => { throw new Error("not used"); },
  prepareFollowUpLoop: async () => { throw new Error("not used"); },
  prepareInterviewBriefingLoop: async () => { throw new Error("not used"); },
  prepareStrategyLoop: async () => { throw new Error("not used"); },
  prepareRiskDeadlineLoop: async () => { throw new Error("not used"); },
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
const interview = {
  id: "interview-qa", applicationId: application.id, roundNumber: 1,
  scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), timezone: "Asia/Hong_Kong",
  status: "scheduled", entityVersion: 1,
} as InterviewRound;
const trackerDetail: ApplicationTrackerDetail = {
  statusEvents: [], interviews: [interview], notes: [], reminders: [],
};
const receipt: SubmissionReceiptView = {
  id: "submission-qa", jdId: "jd-qa", resumeId: "resume-qa",
  resumeContentHash: "b".repeat(64), company: "Acme",
  role: "Backend Engineer", targetUrl: "https://jobs.example/apply",
  siteApplicationId: null, status: "confirmed", createdAt: now,
};
const receiptApp = createApp(ApplicationDetailPanel, {
  application, references, detail: trackerDetail, submissionReceipt: receipt, loopsEnabled: true,
});
receiptApp.config.globalProperties.$t = translate;
receiptApp.config.globalProperties.$locale = localeCode;
receiptApp.config.globalProperties.$tf = translateFormat;
receiptApp.mount("#receipt-qa");
const mailSettingsApp = createApp(MailConnectionsSettings, {
  api, conversationId: "conversation-qa",
});
mailSettingsApp.config.globalProperties.$t = translate;
mailSettingsApp.config.globalProperties.$locale = localeCode;
mailSettingsApp.config.globalProperties.$tf = translateFormat;
mailSettingsApp.mount("#mail-settings-qa");
const resumeLoopApp = createApp(ResumeJobLoopDialog, {
  api, conversationId: "conversation-qa",
  resume: {
    resumeId: "resume-qa",
    entry: { displayTitle: "Backend Resume" },
  },
});
resumeLoopApp.config.globalProperties.$t = translate;
resumeLoopApp.config.globalProperties.$locale = localeCode;
resumeLoopApp.config.globalProperties.$tf = translateFormat;
resumeLoopApp.mount("#resume-loop-qa");
mountExtendedLoopFixtures({ api, application, interview });
const app = createApp(AgentTasksView, { api });
app.config.globalProperties.$t = translate;
app.config.globalProperties.$locale = localeCode;
app.config.globalProperties.$tf = translateFormat;
app.mount("#app");
