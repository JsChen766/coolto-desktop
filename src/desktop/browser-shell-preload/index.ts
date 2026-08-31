import { contextBridge, ipcRenderer } from "electron";

import type {
  BrowserShellApi,
  BrowserShellState,
  DesktopPlatform,
} from "../shared/types.js";
import { BROWSER_SHELL_CHANNELS } from "../main/browser/browser-ipc-channels.js";

const api: BrowserShellApi = {
  platform: process.platform as DesktopPlatform,
  ready: (locale) => ipcRenderer.send(BROWSER_SHELL_CHANNELS.ready, locale),
  requestState: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.requestState),
  newTab: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.newTab),
  closeTab: (tabId) => ipcRenderer.send(BROWSER_SHELL_CHANNELS.closeTab, tabId),
  selectTab: (tabId) =>
    ipcRenderer.send(BROWSER_SHELL_CHANNELS.selectTab, tabId),
  navigate: (url) => ipcRenderer.send(BROWSER_SHELL_CHANNELS.navigate, url),
  goBack: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.goBack),
  goForward: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.goForward),
  reload: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.reload),
  stopLoading: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.stopLoading),
  reportChromeHeight: (height) =>
    ipcRenderer.send(BROWSER_SHELL_CHANNELS.chromeHeight, height),
  minimizeWindow: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.minimize),
  toggleMaximizeWindow: () =>
    ipcRenderer.send(BROWSER_SHELL_CHANNELS.toggleMaximize),
  closeWindow: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.closeWindow),
  pauseAgent: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.pauseAgent),
  resumeAgent: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.resumeAgent),
  takeoverAgent: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.takeoverAgent),
  stopAgent: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.stopAgent),
  dismissDownload: (downloadId) =>
    ipcRenderer.send(BROWSER_SHELL_CHANNELS.dismissDownload, downloadId),
  toggleDownloadPopover: () =>
    ipcRenderer.send(BROWSER_SHELL_CHANNELS.toggleDownloadPopover),
  openPageInApp: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.openPageInApp),
  dismissPermissionNotice: () =>
    ipcRenderer.send(BROWSER_SHELL_CHANNELS.dismissPermissionNotice),
  toggleAgentInspector: () =>
    ipcRenderer.send(BROWSER_SHELL_CHANNELS.toggleAgentInspector),
  searchFind: (query) => ipcRenderer.send(BROWSER_SHELL_CHANNELS.searchFind, query),
  findNext: (direction) => ipcRenderer.send(BROWSER_SHELL_CHANNELS.findNext, direction),
  closeFind: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.closeFind),
  resetZoom: () => ipcRenderer.send(BROWSER_SHELL_CHANNELS.resetZoom),
  onStateChanged: (listener: (state: BrowserShellState) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: BrowserShellState,
    ): void => listener(state);
    ipcRenderer.on(BROWSER_SHELL_CHANNELS.stateChanged, handler);
    return () =>
      ipcRenderer.removeListener(BROWSER_SHELL_CHANNELS.stateChanged, handler);
  },
  onFocusAddress: (listener) => subscribe(BROWSER_SHELL_CHANNELS.focusAddress, listener),
  onFocusFind: (listener) => subscribe(BROWSER_SHELL_CHANNELS.focusFind, listener),
  onFocusAgentCapsule: (listener) =>
    subscribe(BROWSER_SHELL_CHANNELS.focusAgentCapsule, listener),
  onFocusDownloads: (listener) =>
    subscribe(BROWSER_SHELL_CHANNELS.focusDownloads, listener),
};

function subscribe(channel: string, listener: () => void): () => void {
  const handler = (): void => listener();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("browserShell", api);
