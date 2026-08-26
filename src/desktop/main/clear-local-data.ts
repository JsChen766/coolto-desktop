import type { IpcMain } from "electron";

import type { LocalSyncStore } from "./sync/local-sync-store.js";
import type { ConversationSelectedFiles } from "./conversation-selected-files.js";
import type { ConversationStore } from "./conversation-store.js";
import type { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import type { AgentHarnessServices } from "../../agent-task/agent-harness-services.js";

export interface ClearLocalDataTargets {
  conversations: ConversationStore;
  resumeDrafts: ResumeDraftService;
  selectedFiles: ConversationSelectedFiles;
  syncStore: LocalSyncStore;
  agentHarness: AgentHarnessServices;
  mailConnections: { clearAll(): Promise<void> };
}

export async function clearLocalData(targets: ClearLocalDataTargets): Promise<void> {
  await targets.conversations.clearAll();
  await targets.resumeDrafts.clearAll();
  await targets.agentHarness.clearAll();
  await targets.mailConnections.clearAll();
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
      agentHarness: current.agentHarness,
      mailConnections: current.mailConnections,
      syncStore: input.syncStore(),
    });
    input.triggerSync();
  });
}

