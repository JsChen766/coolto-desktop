import type { IpcMain } from "electron";

import {
  executeLocalClear,
  type LocalClearOperations,
  type LocalClearResult,
  type LocalClearScope,
} from "./privacy/local-clear-service.js";

export interface ClearLocalDataTargets {
  conversations: { clearAll(): Promise<void> };
  resumeDrafts: { clearAll(): Promise<void> };
  selectedFiles: { clear(): void };
  deliveryResumeFiles: { clearAll(): Promise<void> };
  syncStore: { purgeLocal(): void };
  agentHarness: { clearAll(): Promise<void> };
  mailConnections: { clearAll(): Promise<void> };
  calendar: { clearAll(): Promise<void> };
  managedResumeUploads: { clearAll(): Promise<void> };
  onboarding?: { clearLocal(): Promise<void> };
}

export async function clearLocalData(targets: ClearLocalDataTargets): Promise<void> {
  await targets.conversations.clearAll();
  await targets.onboarding?.clearLocal();
  await targets.resumeDrafts.clearAll();
  await targets.agentHarness.clearAll();
  await targets.mailConnections.clearAll();
  await targets.calendar.clearAll();
  await targets.managedResumeUploads.clearAll();
  await targets.deliveryResumeFiles.clearAll();
  targets.selectedFiles.clear();
  targets.syncStore.purgeLocal();
}

export interface ClearLocalBusinessServices extends Omit<ClearLocalDataTargets, "syncStore"> {
  agent: { isRunning: boolean };
}

export interface ClearLocalIpcInput {
  services: () => ClearLocalBusinessServices | undefined;
  getCurrentOwner?: () => { ownerId: string; accountEmail?: string } | undefined;
  scopeForOwner?: (ownerId: string) => LocalClearScope;
  quiesce(): Promise<void>;
  clearSync(): Promise<void>;
  clearBrowser(scope?: LocalClearScope): Promise<void>;
  clearRendererStorage(): Promise<void>;
  clearSession(): Promise<void>;
  clearDeviceIdentity(accountEmail?: string): Promise<void>;
  clearAccountDirectories?(ownerId: string): Promise<void>;
  clearPrivacyState?(ownerId: string): Promise<void>;
}
export function createLocalClearOperations(
  input: ClearLocalIpcInput,
  ownerId?: string,
  accountEmail?: string,
  allowMissingOwner = false,
): LocalClearOperations {
  const services = input.services();
  const ensureOwner = (): void => {
    if (!ownerId || !input.getCurrentOwner) return;
    const current = input.getCurrentOwner();
    if (!current && allowMissingOwner) return;
    if (current?.ownerId !== ownerId) {
      throw new Error("账号切换期间拒绝清除");
    }
  };
  return {
    agentRunning: services?.agent.isRunning ?? false,
    ...(accountEmail ? { accountEmail } : {}),
    ...(ownerId && input.scopeForOwner ? { scope: input.scopeForOwner(ownerId) } : {}),
    quiesce: async () => {
      ensureOwner();
      await input.quiesce();
      ensureOwner();
    },
    clearSync: async () => { ensureOwner(); await input.clearSync(); ensureOwner(); },
    clearBusiness: async () => {
      ensureOwner();
      if (services) {
        await clearLocalData({ ...services, syncStore: { purgeLocal: () => undefined } });
      }
      ensureOwner();
      if (ownerId && input.clearAccountDirectories) await input.clearAccountDirectories(ownerId);
      if (ownerId && input.clearPrivacyState) await input.clearPrivacyState(ownerId);
    },
    clearBrowser: async (scope) => { ensureOwner(); await input.clearBrowser(scope); ensureOwner(); },
    clearRendererStorage: async () => { ensureOwner(); await input.clearRendererStorage(); ensureOwner(); },
    clearDeviceIdentity: async (email) => { ensureOwner(); await input.clearDeviceIdentity(email); ensureOwner(); },
    clearSession: async () => { ensureOwner(); await input.clearSession(); },
  };
}

export function registerClearLocalDataIpc(
  ipcMain: IpcMain,
  input: ClearLocalIpcInput,
): void {
  ipcMain.handle("data:clear-local", async (): Promise<LocalClearResult> => {
    const owner = input.getCurrentOwner?.();
    return executeLocalClear(createLocalClearOperations(
      input,
      owner?.ownerId,
      owner?.accountEmail,
    ));
  });
}
