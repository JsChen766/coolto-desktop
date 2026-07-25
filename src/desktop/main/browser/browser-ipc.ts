import type { BrowserWindow, IpcMain } from "electron";

import type {
  BrowserNavigateInput,
  BrowserOpenInput,
  BrowserShellState,
  BrowserState,
} from "../../shared/types.js";
import {
  BROWSER_INVOKE_CHANNELS,
  BROWSER_IPC_CHANNELS,
  BROWSER_SHELL_CHANNELS,
} from "./browser-ipc-channels.js";
import { BrowserWindowManager } from "./browser-window-manager.js";

/**
 * B1: 注册内置浏览器 IPC。
 * - 主窗口 invoke 通道：open/close/navigate/... + state-changed 推送
 * - chrome renderer 通道：ready / 新建/关闭/切换标签 / 导航 / shell-state 推送
 * 主窗口关闭时销毁浏览器窗口。
 */
export function registerBrowserIpc(
  ipcMain: IpcMain,
  mainWindow: BrowserWindow,
): BrowserWindowManager {
  for (const channel of BROWSER_INVOKE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
  for (const channel of Object.values(BROWSER_SHELL_CHANNELS)) {
    ipcMain.removeAllListeners(channel);
  }

  const manager = new BrowserWindowManager({
    emitState: (state: BrowserState) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(BROWSER_IPC_CHANNELS.stateChanged, state);
      }
    },
    emitShellState: (state: BrowserShellState) => {
      broadcastShellState(manager, state);
    },
  });

  registerMainWindowHandlers(ipcMain, manager);
  registerShellHandlers(ipcMain, manager);

  mainWindow.on("closed", () => manager.dispose());
  return manager;
}

function registerMainWindowHandlers(
  ipcMain: IpcMain,
  manager: BrowserWindowManager,
): void {
  ipcMain.handle(BROWSER_IPC_CHANNELS.open, (_e, input?: BrowserOpenInput) =>
    manager.open(input),
  );
  ipcMain.handle(BROWSER_IPC_CHANNELS.close, () => manager.close());
  ipcMain.handle(
    BROWSER_IPC_CHANNELS.navigate,
    (_e, input: BrowserNavigateInput) => manager.navigate(input.url),
  );
  ipcMain.handle(BROWSER_IPC_CHANNELS.goBack, () => manager.goBack());
  ipcMain.handle(BROWSER_IPC_CHANNELS.goForward, () => manager.goForward());
  ipcMain.handle(BROWSER_IPC_CHANNELS.reload, () => manager.reload());
  ipcMain.handle(BROWSER_IPC_CHANNELS.getState, () => manager.getState());
}

function registerShellHandlers(
  ipcMain: IpcMain,
  manager: BrowserWindowManager,
): void {
  const S = BROWSER_SHELL_CHANNELS;
  ipcMain.on(S.ready, () => manager.onShellReady());
  ipcMain.on(S.requestState, () => manager.pushState());
  ipcMain.on(S.newTab, () => manager.tabs?.newTab());
  ipcMain.on(S.closeTab, (_e, tabId: string) => manager.tabs?.closeTab(tabId));
  ipcMain.on(S.selectTab, (_e, tabId: string) => manager.tabs?.select(tabId));
  ipcMain.on(S.goBack, () => manager.goBack());
  ipcMain.on(S.goForward, () => manager.goForward());
  ipcMain.on(S.reload, () => manager.reload());
  ipcMain.on(S.chromeHeight, (_e, height: number) =>
    manager.tabs?.setChromeHeight(height),
  );
  ipcMain.on(S.minimize, () => manager.minimize());
  ipcMain.on(S.toggleMaximize, () => manager.toggleMaximize());
  ipcMain.on(S.closeWindow, () => manager.close());
}

function broadcastShellState(
  manager: BrowserWindowManager,
  state: BrowserShellState,
): void {
  const contents = manager.shellWebContents();
  if (contents && !contents.isDestroyed()) {
    contents.send(BROWSER_SHELL_CHANNELS.stateChanged, state);
  }
}
