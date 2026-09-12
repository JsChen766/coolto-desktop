import type { BrowserWindow, IpcMain } from "electron";

import type { DesktopAuthService } from "./auth-service.js";
import {
  PRIVACY_IPC_CHANNELS,
  registerPrivacyIpc,
  type PrivacyIpcOptions,
} from "./privacy/privacy-ipc.js";

export function registerAuthIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  auth: DesktopAuthService,
  resetUserServices: () => void | Promise<void>,
  privacyOptions: PrivacyIpcOptions,
): void {
  const unsubscribeSync = auth.onSyncSettled(() => {
    if (!window.isDestroyed()) window.webContents.send("sync:completed");
  });
  window.once("closed", unsubscribeSync);
  registerPrivacyIpc(ipcMain, window, auth, privacyOptions);
  ipcMain.handle("auth:current", async () => {
    const user = await auth.restore();
    return user ? { id: user.id, email: user.email } : undefined;
  });
  ipcMain.handle("auth:credits", () => auth.getCredits());
  ipcMain.handle("auth:email-code:request", (_event, email: string) =>
    auth.requestEmailCode(email.trim()),
  );
  ipcMain.handle(
    "auth:email-code:verify",
    async (_event, email: string, challengeId: string, code: string) => {
      const user = await auth.verifyEmailCode(email.trim(), challengeId, code.trim());
      await resetUserServices();
      return { id: user.id, email: user.email };
    },
  );
  ipcMain.handle("auth:logout", async () => {
    await resetUserServices();
    await auth.logout();
  });
  ipcMain.handle("auth:sync-now", () => auth.syncNow());
}

export const AUTH_IPC_CHANNELS = [
  "auth:current", "auth:credits", "auth:email-code:request", "auth:email-code:verify",
  "auth:logout", "auth:sync-now", ...PRIVACY_IPC_CHANNELS,
] as const;
