import type { IpcMain } from "electron";

import type { LocalSyncStore } from "./sync/local-sync-store.js";
import type { ConversationSelectedFiles } from "./conversation-selected-files.js";
import type { ConversationStore } from "./conversation-store.js";
import type { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";

export interface ClearLocalDataTargets {
  conversations: ConversationStore;
  resumeDrafts: ResumeDraftService;
  selectedFiles: ConversationSelectedFiles;
  syncStore: LocalSyncStore;
}

export async function clearLocalData(targets: ClearLocalDataTargets): Promise<void> {
  await targets.conversations.clearAll();
  await targets.resumeDrafts.clearAll();
  targets.selectedFiles.clear();
  targets.syncStore.purgeLocal();
}

export function registerClearLocalDataIpc(
  ipcMain: IpcMain,
  input: {
    services: () => Promise<Omit<ClearLocalDataTargets, "syncStore"> & { agent: { isRunning: boolean } }>;
    syncStore: () => LocalSyncStore;
    triggerSync: () => void;
  },
): void {
  ipcMain.handle("data:clear-local", async () => {
    const current = await input.services();
    if (current.agent.isRunning) {
      throw new Error("Agent 生成期间不能清除本地数据");
    }
    await clearLocalData({
      conversations: current.conversations,
      resumeDrafts: current.resumeDrafts,
      selectedFiles: current.selectedFiles,
      syncStore: input.syncStore(),
    });
    input.triggerSync();
  });
}

