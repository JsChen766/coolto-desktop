import { ipcRenderer } from "electron";

import type {
  ConversationRenameInput,
  ConversationResumeContextInput,
  ConversationsDesktopApi,
} from "../shared/types.js";

export const conversationPreloadApi: ConversationsDesktopApi = {
  list: () => ipcRenderer.invoke("conversations:list"),
  create: () => ipcRenderer.invoke("conversations:create"),
  createForResume: (artifactId) =>
    ipcRenderer.invoke("conversations:create-for-resume", artifactId),
  get: (conversationId) =>
    ipcRenderer.invoke("conversations:get", conversationId),
  bindResume: (input: ConversationResumeContextInput) =>
    ipcRenderer.invoke("conversations:bind-resume", input),
  clearResumeContext: (conversationId) =>
    ipcRenderer.invoke("conversations:clear-resume-context", conversationId),
  rename: (input: ConversationRenameInput) =>
    ipcRenderer.invoke("conversations:rename", input),
  delete: (conversationId) =>
    ipcRenderer.invoke("conversations:delete", conversationId),
};
