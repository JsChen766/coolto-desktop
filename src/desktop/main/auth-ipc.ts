import type { IpcMain } from "electron";

import type { DesktopAuthService } from "./auth-service.js";

export function registerAuthIpc(
  ipcMain: IpcMain,
  auth: DesktopAuthService,
  resetUserServices: () => void,
): void {
  ipcMain.handle("auth:current", async () => {
    const user = await auth.restore();
    return user ? { id: user.id, email: user.email } : undefined;
  });
  ipcMain.handle("auth:credits", () => auth.getCredits());
  ipcMain.handle(
    "auth:login",
    async (_event, email: string, password: string) => {
      const user = await auth.login(email.trim(), password);
      resetUserServices();
      return { id: user.id, email: user.email };
    },
  );
  ipcMain.handle("auth:email-code:request", (_event, email: string) =>
    auth.requestEmailCode(email.trim()),
  );
  ipcMain.handle(
    "auth:email-code:verify",
    async (_event, email: string, challengeId: string, code: string) => {
      const user = await auth.verifyEmailCode(
        email.trim(),
        challengeId,
        code.trim(),
      );
      resetUserServices();
      return { id: user.id, email: user.email };
    },
  );
  ipcMain.handle("auth:logout", async () => {
    resetUserServices();
    await auth.logout();
  });
}

export const AUTH_IPC_CHANNELS = [
  "auth:current",
  "auth:credits",
  "auth:login",
  "auth:email-code:request",
  "auth:email-code:verify",
  "auth:logout",
] as const;
