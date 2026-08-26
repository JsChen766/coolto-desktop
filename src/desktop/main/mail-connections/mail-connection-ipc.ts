import type { IpcMain } from "electron";

import type { UserServices } from "../user-services.js";

export const MAIL_CONNECTION_IPC_CHANNELS = [
  "mail-connections:providers", "mail-connections:list",
  "mail-connections:connect", "mail-connections:disconnect",
] as const;

export function registerMailConnectionIpc(
  ipcMain: IpcMain,
  services: () => Promise<UserServices>,
): void {
  ipcMain.handle("mail-connections:providers", async () =>
    (await services()).mailConnections.providers());
  ipcMain.handle("mail-connections:list", async () =>
    (await services()).mailConnections.list());
  ipcMain.handle("mail-connections:connect", async (_event, value: unknown) => {
    if (value !== "gmail" && value !== "outlook") throw new Error("邮箱 Provider 无效");
    return (await services()).mailConnections.connect(value);
  });
  ipcMain.handle("mail-connections:disconnect", async (_event, value: unknown) => {
    if (typeof value !== "string" || !value.trim()) throw new Error("connectionId 无效");
    return (await services()).mailConnections.disconnect(value.trim());
  });
}
