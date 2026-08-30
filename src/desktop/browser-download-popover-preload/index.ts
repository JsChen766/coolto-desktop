import { contextBridge, ipcRenderer } from "electron";

import type {
  BrowserDownloadPopoverApi,
  BrowserDownloadPopoverViewState,
} from "../shared/types.js";

const C = {
  ready: "browser-download-popover:ready",
  stateChanged: "browser-download-popover:state-changed",
  focus: "browser-download-popover:focus",
  close: "browser-download-popover:close",
  dismiss: "browser-download-popover:dismiss",
} as const satisfies typeof import(
  "../main/browser/browser-ipc-channels.js"
).BROWSER_DOWNLOAD_POPOVER_CHANNELS;

const api: BrowserDownloadPopoverApi = {
  ready: () => ipcRenderer.send(C.ready),
  close: () => ipcRenderer.send(C.close),
  dismiss: (downloadId) => ipcRenderer.send(C.dismiss, downloadId),
  onStateChanged: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: BrowserDownloadPopoverViewState,
    ): void => listener(state);
    ipcRenderer.on(C.stateChanged, handler);
    return () => ipcRenderer.removeListener(C.stateChanged, handler);
  },
  onFocus: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on(C.focus, handler);
    return () => ipcRenderer.removeListener(C.focus, handler);
  },
};

contextBridge.exposeInMainWorld("browserDownloadPopover", api);
