import { contextBridge, ipcRenderer } from "electron";

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

const api: DesktopApi = {
  platform: process.platform,
  auth: {
    getCurrentUser: () => ipcRenderer.invoke("auth:current"),
    login: (email, password) =>
      ipcRenderer.invoke("auth:login", email, password),
	requestEmailCode: (email) =>
		ipcRenderer.invoke("auth:email-code:request", email),
	verifyEmailCode: (email, challengeId, code) =>
		ipcRenderer.invoke("auth:email-code:verify", email, challengeId, code),
    logout: () => ipcRenderer.invoke("auth:logout"),
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
    remove: (input: AttachmentRemoveInput) =>
      ipcRenderer.invoke("attachments:remove", input),
  },
  resumeDrafts: {
    list: () => ipcRenderer.invoke("resume-drafts:list"),
    get: (artifactId) => ipcRenderer.invoke("resume-drafts:get", artifactId),
    edit: (input) => ipcRenderer.invoke("resume-drafts:edit", input),
    restore: (input) => ipcRenderer.invoke("resume-drafts:restore", input),
    accept: (artifactId) =>
      ipcRenderer.invoke("resume-drafts:accept", artifactId),
    reject: (artifactId) =>
      ipcRenderer.invoke("resume-drafts:reject", artifactId),
  },
  library: {
    list: () => ipcRenderer.invoke("library:list"),
    rename: (input) => ipcRenderer.invoke("library:rename", input),
    archive: (input) => ipcRenderer.invoke("library:archive", input),
    deleteDraft: (input) => ipcRenderer.invoke("library:delete-draft", input),
    getCheckpoints: (artifactId) =>
      ipcRenderer.invoke("library:get-checkpoints", artifactId),
    restoreCheckpoint: (input) =>
      ipcRenderer.invoke("library:restore-checkpoint", input),
  },
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
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
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
