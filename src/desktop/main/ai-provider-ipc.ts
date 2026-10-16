import type { IpcMain } from "electron";

import type { AiProviderSaveInput } from "../shared/types/ai-provider.js";
import { ElectronAiProviderStore } from "./ai-provider-store.js";

export function registerAiProviderIpc(
  ipcMain: IpcMain,
  store = new ElectronAiProviderStore(),
): void {
  void store.load();
  ipcMain.handle("ai-provider:get", () => store.publicView());
  ipcMain.handle("ai-provider:save", (_event, input: AiProviderSaveInput) => {
    if (!input || typeof input.baseUrl !== "string" || typeof input.modelId !== "string") {
      throw new Error("AI 接口配置无效");
    }
    return store.save({
      baseUrl: input.baseUrl,
      modelId: input.modelId,
      ...(typeof input.apiKey === "string" ? { apiKey: input.apiKey } : {}),
    });
  });
}

export const AI_PROVIDER_IPC_CHANNELS = [
  "ai-provider:get",
  "ai-provider:save",
] as const;
