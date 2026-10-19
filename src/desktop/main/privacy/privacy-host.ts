import type { BrowserWindow } from "electron";

import type { DesktopAuthService } from "../auth-service.js";
import {
  createLocalClearOperations,
  type ClearLocalIpcInput,
} from "../clear-local-data.js";
import type { UserServicesResolver } from "../user-services.js";
import type { BrowserWindowManager } from "../browser/browser-window-manager.js";
import { getBrowserSession, getBrowserSessionForScope } from "../browser/browser-session.js";
import { offlineScopeDigest } from "../../../privacy/export-canonical.js";
import { DeletionRecoveryStore } from "./deletion-recovery-store.js";
import { createLocalExportReader } from "./local-export-reader.js";
import { clearAccountLocalDirectories } from "./local-account-cleanup.js";
import { executeLocalClear } from "./local-clear-service.js";
import { PrivacyDeletionService } from "./privacy-deletion-service.js";
import { DataExportService } from "./data-export-service.js";
import { ElectronExportSaveDialog } from "./electron-export-save-dialog.js";
import { buildLocalBusinessSnapshot } from "./local-business-export-snapshot.js";
import type { PrivacyIpcOptions } from "./privacy-ipc.js";

export interface PrivacyHostWiring {
  clearLocal: ClearLocalIpcInput;
  ipc: PrivacyIpcOptions;
}

export function createPrivacyHostWiring(
  auth: DesktopAuthService,
  window: BrowserWindow,
  services: UserServicesResolver,
  browserWindow: BrowserWindowManager,
): PrivacyHostWiring {
  const clearLocal: ClearLocalIpcInput = {
    services: () => services.current(),
    getCurrentOwner: () => {
      try {
        const user = auth.requireCurrentUser();
        return { ownerId: user.id, accountEmail: user.email };
      } catch {
        return undefined;
      }
    },
    scopeForOwner: (ownerId) => ({
      ownerId,
      apiBaseUrl: auth.apiBaseUrl,
      scopeDigest: offlineScopeDigest(auth.apiBaseUrl, ownerId),
    }),
    quiesce: async () => {
      await services.quiesce();
      browserWindow.close();
    },
    clearSync: () => auth.destroyLocalSync(),
    clearPrivacyState: (ownerId) => auth.privacy.clearLocalStateForOwner(ownerId),
    clearBrowser: async (scope) => {
      browserWindow.close();
      const target = scope
        ? getBrowserSessionForScope(scope.apiBaseUrl, scope.ownerId)
        : getBrowserSession();
      await target.clearStorageData();
    },
    clearRendererStorage: () => window.webContents.session.clearStorageData(),
    clearSession: () => auth.clearAuthSession(),
    clearDeviceIdentity: (accountEmail) => auth.clearCurrentDeviceIdentity(accountEmail),
    clearAccountDirectories: (ownerId) => clearAccountLocalDirectories(auth.apiBaseUrl, ownerId),
  };
  return {
    clearLocal,
    ipc: {
      exportService: new DataExportService(
        auth.apiClient.privacy,
        createLocalExportReader(
          () => services.current(),
          () => {
            try { return auth.requireSyncStore(); } catch { return undefined; }
          },
        ),
        new ElectronExportSaveDialog(window),
        () => {
          const user = auth.requireCurrentUser();
          return {
            ownerId: user.id,
            apiBaseUrl: auth.apiBaseUrl,
            scopeDigest: offlineScopeDigest(auth.apiBaseUrl, user.id),
          };
        },
        {
          read: async (scope) => {
            try {
              const store = auth.requireSyncStore();
              return buildLocalBusinessSnapshot({
                source: store,
                accountScopeDigest: scope.scopeDigest,
              });
            } catch {
              return null;
            }
          },
        },
      ),
      hasDeletionRecovery: async () => {
        try {
          const user = (() => {
            try { return auth.requireCurrentUser(); } catch { return undefined; }
          })();
          const store = await DeletionRecoveryStore.discoverOne(auth.apiBaseUrl, user?.id);
          return Boolean(store);
        } catch {
          return false;
        }
      },
      createDeletionService: async () => {
        const user = (() => {
          try { return auth.requireCurrentUser(); } catch { return undefined; }
        })();
        const discovered = await DeletionRecoveryStore.discoverOne(auth.apiBaseUrl, user?.id);
        if (discovered && user && !discovered.matchesOwner(user.id)) {
          throw new Error("删除恢复记录与当前账号不匹配");
        }
        const store = discovered ?? (user ? new DeletionRecoveryStore(auth.apiBaseUrl, user.id) : undefined);
        if (!store) throw new Error("没有待恢复的删除请求");
        return new PrivacyDeletionService({
          api: auth.apiClient.privacy,
          store,
          currentUser: () => auth.requireCurrentUser(),
          clearLocal: (ownerId, accountEmail) => executeLocalClear(
            createLocalClearOperations(clearLocal, ownerId, accountEmail, true),
          ),
          restrictOrdinaryAccess: async () => {
            auth.privacy.setRestrictedRecovery(true);
            try {
              await services.clear("account_changed");
            } finally {
              await auth.dispose();
            }
          },
          restoreOrdinaryAccess: () => auth.privacy.setRestrictedRecovery(false),
        });
      },
    },
  };
}
