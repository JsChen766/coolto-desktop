import type { BrowserWindow, IpcMain } from "electron";

import type { UpdateTrigger } from "../../shared/types.js";
import type { ElectronUpdateService } from "./electron-update-service.js";

export const UPDATE_IPC_CHANNELS = [
  "updates:state",
  "updates:check",
  "updates:install",
] as const;

export function registerUpdateIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  service: ElectronUpdateService,
): void {
  const pushState = (): void => {
    if (window.isDestroyed()) return;
    window.webContents.send("updates:event", service.getState());
  };
  service.subscribe(pushState);
  ipcMain.handle("updates:state", () => service.getState());
  ipcMain.handle(
    "updates:check",
    (_event, trigger: UpdateTrigger) => service.checkForUpdates(trigger),
  );
  ipcMain.handle("updates:install", () => service.install());
}
