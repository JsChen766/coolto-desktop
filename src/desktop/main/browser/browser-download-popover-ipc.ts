import type { IpcMain, IpcMainEvent } from "electron";

import { BROWSER_DOWNLOAD_POPOVER_CHANNELS as C } from "./browser-ipc-channels.js";
import type { BrowserWindowManager } from "./browser-window-manager.js";

export function registerBrowserDownloadPopoverIpc(
  ipcMain: IpcMain,
  manager: BrowserWindowManager,
): void {
  onPopover(ipcMain, manager, C.ready, () =>
    manager.shellCommands.onDownloadPopoverReady());
  onPopover(ipcMain, manager, C.close, () =>
    manager.shellCommands.closeDownloadPopover(), true);
  onPopover(ipcMain, manager, C.dismiss, (_event, downloadId) => {
    if (validDownloadId(downloadId)) manager.dismissDownload(downloadId);
  }, true);
}

function onPopover(
  ipcMain: IpcMain,
  manager: BrowserWindowManager,
  channel: string,
  listener: (event: IpcMainEvent, ...args: unknown[]) => void,
  requireOpen = false,
): void {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    if (event.sender !== manager.shellCommands.downloadPopoverWebContents()) return;
    if (requireOpen && !manager.shellCommands.isDownloadPopoverOpen) return;
    listener(event, ...args);
  });
}

function validDownloadId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}
