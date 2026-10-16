import { ipcRenderer } from "electron";

import type {
  AiProviderDesktopApi,
  AiProviderSaveInput,
} from "../shared/types/ai-provider.js";

export const aiProviderPreloadApi: AiProviderDesktopApi = {
  get: () => ipcRenderer.invoke("ai-provider:get"),
  save: (input: AiProviderSaveInput) => ipcRenderer.invoke("ai-provider:save", input),
};
