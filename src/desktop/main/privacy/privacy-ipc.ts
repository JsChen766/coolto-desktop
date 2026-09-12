import type { BrowserWindow, IpcMain } from "electron";

import type { DesktopAuthService } from "../auth-service.js";
import type {
  PrivacyExportOptions,
  PrivacyDeletionInput,
  PrivacyGateState,
} from "../../shared/types/privacy.js";
import type { DataExportService } from "./data-export-service.js";
import { PrivacyDeletionService, emptyDeletionState } from "./privacy-deletion-service.js";

export interface PrivacyIpcOptions {
  exportService: DataExportService;
  createDeletionService(): Promise<PrivacyDeletionService>;
  hasDeletionRecovery(): Promise<boolean>;
  resetUserServices?(): Promise<void>;
}

export const PRIVACY_IPC_CHANNELS = [
  "privacy:get-state", "privacy:accept", "privacy:decline", "privacy:event",
  "privacy:export", "privacy:deletion:start", "privacy:deletion:retry",
  "privacy:deletion:ack", "privacy:deletion:state", "privacy:deletion:event",
] as const;

export function registerPrivacyIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  auth: DesktopAuthService,
  options: PrivacyIpcOptions,
): void {
  const privacy = auth.privacy;
  let deletion: PrivacyDeletionService | undefined;
  let deletionOwnerId: string | undefined;
  let unsubscribeDeletionState: (() => void) | undefined;
  const ensureDeletion = async (): Promise<PrivacyDeletionService> => {
    const ownerId = (() => {
      try { return auth.requireCurrentUser().id; } catch { return undefined; }
    })();
    if (deletion && deletionOwnerId === ownerId) return deletion;
    unsubscribeDeletionState?.();
    deletion = undefined;
    deletionOwnerId = ownerId;
    const created = await options.createDeletionService();
    deletion = created;
    unsubscribeDeletionState = created.onStateChange((state) => {
      if (!window.isDestroyed()) window.webContents.send("privacy:deletion:event", state);
    });
    return created;
  };
  const unsubscribePrivacy = privacy.onStateChange((state) => {
    if (!window.isDestroyed()) window.webContents.send("privacy:event", state);
  });
  window.once("closed", () => {
    unsubscribePrivacy();
    unsubscribeDeletionState?.();
  });
  ipcMain.handle("privacy:get-state", () => privacy.getState());
  ipcMain.handle("privacy:accept", async () => {
    const state = await privacy.accept();
    if (privacy.hasCurrentUser) await auth.resumeAfterPrivacy();
    return state;
  });
  ipcMain.handle("privacy:decline", async () => {
    let state: PrivacyGateState;
    try {
      state = await privacy.decline();
    } finally {
      try {
        await options.resetUserServices?.();
      } finally {
        await auth.dispose();
      }
    }
    return state;
  });
  ipcMain.handle("privacy:export", async (_event, input: unknown) => {
    const request = parsePrivacyExportOptions(input);
    await requireExportAccess(auth, request);
    return options.exportService.export(request);
  });
  ipcMain.handle("privacy:deletion:start", async (_event, input: unknown) => {
    await requirePrivacyFeature(auth, options.hasDeletionRecovery);
    return (await ensureDeletion()).start(parsePrivacyDeletionInput(input));
  });
  ipcMain.handle("privacy:deletion:retry", async () => {
    await requirePrivacyFeature(auth, options.hasDeletionRecovery);
    return (await ensureDeletion()).retry();
  });
  ipcMain.handle("privacy:deletion:ack", async () => {
    await requirePrivacyFeature(auth, options.hasDeletionRecovery);
    return (await ensureDeletion()).acknowledge();
  });
  ipcMain.handle("privacy:deletion:state", async () => {
    if (privacy.isOfflineLocalOnly) return emptyDeletionState();
    try {
      return await (await ensureDeletion()).recover();
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "没有待恢复的删除请求") return emptyDeletionState();
      throw error;
    }
  });
}

export function parsePrivacyExportOptions(value: unknown): PrivacyExportOptions {
  const record = plainRecord(value, "导出参数无效");
  requireExactKeys(record, EXPORT_FIELDS, "导出参数包含未支持字段");
  const passphrase = record.passphrase;
  if (typeof passphrase !== "string" || passphrase.length < 8 || passphrase.length > 512) throw new Error("导出参数无效");
  return {
    includeCloudAssets: boolean(record.includeCloudAssets), includeConversations: boolean(record.includeConversations),
    includeDrafts: boolean(record.includeDrafts), includeTasks: boolean(record.includeTasks), passphrase,
  };
}

export function parsePrivacyDeletionInput(value: unknown): PrivacyDeletionInput {
  const record = plainRecord(value, "删除参数无效");
  requireExactKeys(record, DELETION_FIELDS, "删除参数包含未支持字段");
  return { accountEmail: nonEmptyString(record.accountEmail, "删除参数无效"), confirmation: nonEmptyString(record.confirmation, "删除参数无效") };
}

const EXPORT_FIELDS: Record<string, true> = {
  includeCloudAssets: true, includeConversations: true, includeDrafts: true,
  includeTasks: true, passphrase: true,
};
const DELETION_FIELDS: Record<string, true> = { accountEmail: true, confirmation: true };

function plainRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(message);
  return Object.fromEntries(Object.entries(value));
}
function requireExactKeys(record: Record<string, unknown>, fields: Record<string, true>, message: string): void {
  if (Object.keys(record).some((key) => fields[key] !== true)) throw new Error(message);
  for (const key of Object.keys(fields)) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(message);
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("隐私参数无效");
  return value;
}
function nonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value;
}
async function requireExportAccess(
  auth: DesktopAuthService,
  options: PrivacyExportOptions,
): Promise<void> {
  if (!options.includeCloudAssets && auth.privacy.isOfflineLocalOnly) return;
  if (auth.privacy.isCloudBusinessAllowed) return;
  throw new Error("当前服务器尚不支持隐私功能，请升级 Coolto");
}

export async function requirePrivacyFeature(
  auth: DesktopAuthService,
  hasDeletionRecovery: () => Promise<boolean>,
): Promise<void> {
  if (auth.privacy.isOfflineLocalOnly) {
    throw new Error("离线缓存同意仅允许本机读取或导出");
  }
  if (auth.privacy.isFeatureAvailable) return;
  if (await hasDeletionRecovery()) return;
  throw new Error("当前服务器尚不支持隐私功能，请升级 Coolto");
}
