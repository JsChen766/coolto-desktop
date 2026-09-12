import type { BrowserWindow, IpcMain } from "electron";

import type { UserServices } from "../user-services-contract.js";
import { createMaterialFileDialogSelectors } from "./material-file-dialogs.js";
import { registerMaterialIpc } from "./material-ipc.js";

export function registerAppMaterialIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  servicesForCurrentUser: () => Promise<UserServices>,
): void {
  const dialogs = createMaterialFileDialogSelectors(window);
  registerMaterialIpc(ipcMain, async () => {
    const current = await servicesForCurrentUser();
    return { ...current.material.ipc, ...dialogs };
  });
}
