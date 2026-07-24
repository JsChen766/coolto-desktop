import { contextBridge, ipcRenderer } from "electron";

import type {
  AgentPromptInput,
  ApprovalResolveInput,
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
};

contextBridge.exposeInMainWorld("coolto", api);
