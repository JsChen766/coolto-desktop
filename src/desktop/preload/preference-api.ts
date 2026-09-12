import { ipcRenderer } from "electron";
import type { PreferenceDesktopApi } from "../shared/types/preferences.js";

export const preferencePreloadApi: PreferenceDesktopApi = {
  list: (filter) => ipcRenderer.invoke("preferences:list", filter),
  get: (id) => ipcRenderer.invoke("preferences:get", id),
  prepareCreate: (input) => ipcRenderer.invoke("preferences:prepare-create", input),
  prepareCreateFromSuggestion: (input, suggestionId) =>
    ipcRenderer.invoke("preferences:prepare-create-from-suggestion", input, suggestionId),
  prepareUpdate: (id, input) => ipcRenderer.invoke("preferences:prepare-update", id, input),
  prepareDisable: (id) => ipcRenderer.invoke("preferences:prepare-disable", id),
  prepareEnable: (id) => ipcRenderer.invoke("preferences:prepare-enable", id),
  prepareDelete: (id) => ipcRenderer.invoke("preferences:prepare-delete", id),
  prepareAcceptServer: (id) => ipcRenderer.invoke("preferences:prepare-accept-server", id),
  prepareReapply: (id) => ipcRenderer.invoke("preferences:prepare-reapply", id),
  executeProposal: (id) => ipcRenderer.invoke("preferences:execute-proposal", id),
  resolve: (input) => ipcRenderer.invoke("preferences:resolve", input),
  suggestions: {
    list: () => ipcRenderer.invoke("preferences:suggestions:list"),
    reject: (id) => ipcRenderer.invoke("preferences:suggestions:reject", id),
    clearSuppressed: () => ipcRenderer.invoke("preferences:suggestions:clear-suppressed"),
  },
};
