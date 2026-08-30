import { contextBridge, ipcRenderer, webUtils } from "electron";

import type {
  AgentPromptInput,
  AttachmentRemoveInput,
  ApprovalResolveInput,
  BrowserNavigateInput,
  BrowserOpenInput,
  BrowserState,
  ConversationRenameInput,
  DesktopAgentEvent,
  DesktopApi,
} from "../shared/types.js";
import { onboardingPreloadApi } from "./onboarding-api.js";

const api: DesktopApi = {
  platform: process.platform,
  auth: {
    getCurrentUser: () => ipcRenderer.invoke("auth:current"),
    getCredits: () => ipcRenderer.invoke("auth:credits"),
	requestEmailCode: (email) =>
		ipcRenderer.invoke("auth:email-code:request", email),
	verifyEmailCode: (email, challengeId, code) =>
		ipcRenderer.invoke("auth:email-code:verify", email, challengeId, code),
    logout: () => ipcRenderer.invoke("auth:logout"),
    syncNow: () => ipcRenderer.invoke("auth:sync-now"),
  },
  checkout: {
    plans: () => ipcRenderer.invoke("checkout:plans"),
    create: (planType: string) =>
      ipcRenderer.invoke("checkout:create", planType),
    verify: (checkoutId: string) =>
      ipcRenderer.invoke("checkout:verify", checkoutId),
  },
  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke("shell:open-external", url),
  },
  conversations: {
    list: () => ipcRenderer.invoke("conversations:list"),
    create: () => ipcRenderer.invoke("conversations:create"),
    get: (conversationId) =>
      ipcRenderer.invoke("conversations:get", conversationId),
    rename: (input: ConversationRenameInput) =>
      ipcRenderer.invoke("conversations:rename", input),
    delete: (conversationId) =>
      ipcRenderer.invoke("conversations:delete", conversationId),
  },
  attachments: {
    list: (conversationId) =>
      ipcRenderer.invoke("attachments:list", conversationId),
    select: (conversationId) =>
      ipcRenderer.invoke("attachments:select", conversationId),
    selectPath: (conversationId, path) =>
      ipcRenderer.invoke("attachments:select-path", conversationId, path),
    remove: (input: AttachmentRemoveInput) =>
      ipcRenderer.invoke("attachments:remove", input),
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  resumeDrafts: {
    list: () => ipcRenderer.invoke("resume-drafts:list"),
    get: (artifactId) => ipcRenderer.invoke("resume-drafts:get", artifactId),
    edit: (input) => ipcRenderer.invoke("resume-drafts:edit", input),
    setLineSpacing: (input) =>
      ipcRenderer.invoke("resume-drafts:set-line-spacing", input),
    restore: (input) => ipcRenderer.invoke("resume-drafts:restore", input),
    accept: (artifactId) =>
      ipcRenderer.invoke("resume-drafts:accept", artifactId),
    reject: (artifactId) =>
      ipcRenderer.invoke("resume-drafts:reject", artifactId),
    exportPdf: (input) =>
      ipcRenderer.invoke("resume-drafts:export-pdf", input),
    save: (input) => ipcRenderer.invoke("resume-drafts:save", input),
  },
  updates: {
    getState: () => ipcRenderer.invoke("updates:state"),
    check: (trigger) => ipcRenderer.invoke("updates:check", trigger),
    install: () => ipcRenderer.invoke("updates:install"),
    onStateChange: (listener) =>
      subscribeIpc("updates:event", listener),
  },
  library: {
    list: () => ipcRenderer.invoke("library:list"),
    preview: (resumeId) => ipcRenderer.invoke("library:preview", resumeId),
    rename: (input) => ipcRenderer.invoke("library:rename", input),
    archive: (input) => ipcRenderer.invoke("library:archive", input),
    deleteDraft: (input) => ipcRenderer.invoke("library:delete-draft", input),
    getCheckpoints: (artifactId) =>
      ipcRenderer.invoke("library:get-checkpoints", artifactId),
    restoreCheckpoint: (input) =>
      ipcRenderer.invoke("library:restore-checkpoint", input),
  },
  deliveryResumeFiles: {
    list: () => ipcRenderer.invoke("delivery-resume-files:list"),
    importFile: () => ipcRenderer.invoke("delivery-resume-files:import"),
    rename: (input) => ipcRenderer.invoke("delivery-resume-files:rename", input),
    select: (input) => ipcRenderer.invoke("delivery-resume-files:select", input),
    delete: (input) => ipcRenderer.invoke("delivery-resume-files:delete", input),
  },
  jobAssets: {
    get: () => ipcRenderer.invoke("job-assets:get"),
  },
  experiences: {
    search: (options) => ipcRenderer.invoke("experiences:search", options),
    get: (experienceId) => ipcRenderer.invoke("experiences:get", experienceId),
    history: (input) => ipcRenderer.invoke("experiences:history", input),
    prepareCreate: (input) => ipcRenderer.invoke("experiences:prepare-create", input),
    prepareUpdate: (input) => ipcRenderer.invoke("experiences:prepare-update", input),
    prepareArchive: (id) => ipcRenderer.invoke("experiences:prepare-archive", id),
    prepareRestore: (id) => ipcRenderer.invoke("experiences:prepare-restore", id),
    prepareDelete: (id) => ipcRenderer.invoke("experiences:prepare-delete", id),
    prepareRestoreRevision: (input) =>
      ipcRenderer.invoke("experiences:prepare-restore-revision", input),
    syncIssue: (id) => ipcRenderer.invoke("experiences:sync-issue", id),
    prepareAcceptServer: (id) =>
      ipcRenderer.invoke("experiences:prepare-accept-server", id),
    prepareReapply: (id) => ipcRenderer.invoke("experiences:prepare-reapply", id),
    prepareSaveAsNew: (id) =>
      ipcRenderer.invoke("experiences:prepare-save-as-new", id),
    executeProposal: (id) =>
      ipcRenderer.invoke("experiences:execute-proposal", id),
  },
  profile: {
    get: () => ipcRenderer.invoke("profile:get"),
    prepareUpdate: (changes) => ipcRenderer.invoke("profile:prepare-update", changes),
    prepareReapply: (changes) => ipcRenderer.invoke("profile:prepare-reapply", changes),
    prepareAcceptServer: () => ipcRenderer.invoke("profile:prepare-accept-server"),
    executeProposal: (id) => ipcRenderer.invoke("profile:execute-proposal", id),
  },
  applications: {
    list: (options) => ipcRenderer.invoke("applications:list", options),
    references: () => ipcRenderer.invoke("applications:references"),
    get: (applicationId) => ipcRenderer.invoke("applications:get", applicationId),
    create: (input) => ipcRenderer.invoke("applications:create", input),
    prepareCreate: (input) => ipcRenderer.invoke("applications:prepare-create", input),
    prepareUpdate: (input) => ipcRenderer.invoke("applications:prepare-update", input),
    executeProposal: (proposalId) =>
      ipcRenderer.invoke("applications:execute-proposal", proposalId),
    update: (input) => ipcRenderer.invoke("applications:update", input),
    transition: (input) => ipcRenderer.invoke("applications:transition", input),
    delete: (applicationId) => ipcRenderer.invoke("applications:delete", applicationId),
  },
  tracker: {
    detail: (applicationId) => ipcRenderer.invoke("tracker:detail", applicationId),
    overview: () => ipcRenderer.invoke("tracker:overview"),
    syncIssues: () => ipcRenderer.invoke("tracker:sync-issues"),
    prepareRecovery: (input) => ipcRenderer.invoke("tracker:prepare-recovery", input),
    executeRecovery: (id) => ipcRenderer.invoke("tracker:execute-recovery", id),
    retryPending: () => ipcRenderer.invoke("tracker:retry-pending"),
  },
  interviews: childApi("interviews"),
  notes: childApi("notes"),
  reminders: childApi("reminders"),
  agent: {
    prompt: (input: AgentPromptInput) =>
      ipcRenderer.invoke("agent:prompt", input),
    cancel: () => ipcRenderer.invoke("agent:cancel"),
    resolveApproval: (input: ApprovalResolveInput) =>
      ipcRenderer.invoke("agent:resolve-approval", input),
    onEvent: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: {
          conversationId: string;
          event: DesktopAgentEvent;
        },
      ): void => listener(payload.conversationId, payload.event);
      ipcRenderer.on("agent:event", handler);
      return () => ipcRenderer.removeListener("agent:event", handler);
    },
  },
  mailConnections: {
    providers: () => ipcRenderer.invoke("mail-connections:providers"),
    list: () => ipcRenderer.invoke("mail-connections:list"),
    connect: (provider) => ipcRenderer.invoke("mail-connections:connect", provider),
    disconnect: (connectionId) =>
      ipcRenderer.invoke("mail-connections:disconnect", connectionId),
  },
  onboarding: onboardingPreloadApi,
  agentTasks: {
    list: () => ipcRenderer.invoke("agent-tasks:list"),
    get: (taskId) => ipcRenderer.invoke("agent-tasks:get", taskId),
    prepare: (input) => ipcRenderer.invoke("agent-tasks:prepare", input),
    executeProposal: (id) => ipcRenderer.invoke("agent-tasks:execute-proposal", id),
    start: (id) => ipcRenderer.invoke("agent-tasks:start", id),
    resume: (id) => ipcRenderer.invoke("agent-tasks:resume", id),
    pause: (id) => ipcRenderer.invoke("agent-tasks:pause", id),
    cancel: (id) => ipcRenderer.invoke("agent-tasks:cancel", id),
    revoke: (id) => ipcRenderer.invoke("agent-tasks:revoke", id),
    submissionReceipt: (id) =>
      ipcRenderer.invoke("agent-tasks:submission-receipt", id),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    reportDraftSaveState: (state) =>
      ipcRenderer.invoke("window:draft-save-state", state),
    completeSaveBeforeClose: (success) =>
      ipcRenderer.invoke("window:save-before-close-complete", success),
    onSaveBeforeClose: (listener) =>
      subscribeIpc("window:save-before-close", listener),
  },
  data: {
    clearLocal: () => ipcRenderer.invoke("data:clear-local"),
  },
  browser: {
    open: (input?: BrowserOpenInput) =>
      ipcRenderer.invoke("browser:open", input),
    close: () => ipcRenderer.invoke("browser:close"),
    navigate: (input: BrowserNavigateInput) =>
      ipcRenderer.invoke("browser:navigate", input),
    goBack: () => ipcRenderer.invoke("browser:go-back"),
    goForward: () => ipcRenderer.invoke("browser:go-forward"),
    reload: () => ipcRenderer.invoke("browser:reload"),
    getState: () => ipcRenderer.invoke("browser:get-state"),
    abortFill: () => ipcRenderer.invoke("browser:abort-fill"),
    onStateChanged: (listener: (state: BrowserState) => void) =>
      subscribeIpc("browser:state-changed", listener),
    onFillProgress: (listener) =>
      subscribeIpc("browser:fill-progress", listener),
    onReviewDecision: (listener) =>
      subscribeIpc("browser:review-decision", listener),
    onReviewComplete: (listener) =>
      subscribeIpc("browser:review-complete", listener),
    onCaptchaDetected: (listener) =>
      subscribeIpc("browser:captcha-detected", listener),
  },
};

function childApi(channel: "interviews" | "notes" | "reminders") {
  return {
    prepareCreate: (input: unknown) => ipcRenderer.invoke(`${channel}:prepare-create`, input),
    prepareUpdate: (input: unknown) => ipcRenderer.invoke(`${channel}:prepare-update`, input),
    prepareDelete: (id: string) => ipcRenderer.invoke(`${channel}:prepare-delete`, id),
    executeProposal: (id: string) => ipcRenderer.invoke(`${channel}:execute-proposal`, id),
  };
}

function subscribeIpc<T>(
  channel: string,
  listener: (payload: T) => void,
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void =>
    listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("coolto", api);
