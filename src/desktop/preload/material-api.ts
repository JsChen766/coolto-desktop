import { ipcRenderer } from "electron";

import type { MaterialApi } from "../shared/types/material.js";

export const materialPreloadApi: MaterialApi = {
  select: () => ipcRenderer.invoke("material:select"),
  list: (options) => ipcRenderer.invoke("material:list", options),
  get: (materialId) => ipcRenderer.invoke("material:get", materialId),
  import: (input) => ipcRenderer.invoke("material:import", input),
  processOcr: (materialId) => ipcRenderer.invoke("material:ocr", materialId),
  confirmOcr: (materialId, correctedText) =>
    ipcRenderer.invoke("material:ocr-confirm", materialId, correctedText),
  prepareRelation: (input) => ipcRenderer.invoke("material:relation:prepare", input),
  approveRelation: (proposalId) => ipcRenderer.invoke("material:relation:approve", proposalId),
  rejectRelation: (proposalId) => ipcRenderer.invoke("material:relation:reject", proposalId),
  previewDelete: (materialId) => ipcRenderer.invoke("material:delete:preview", materialId),
  cancelDelete: (token) => ipcRenderer.invoke("material:delete:cancel", token),
  confirmDelete: (token) => ipcRenderer.invoke("material:delete:confirm", token),
  exportPackage: () => ipcRenderer.invoke("material:export"),
  restorePackage: () => ipcRenderer.invoke("material:restore"),
};
