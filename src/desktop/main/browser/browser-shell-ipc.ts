import type { IpcMain, IpcMainEvent } from "electron";

import { normalizeBrowserNavigationUrl } from "../../../browser/browser-navigation-url.js";
import type { BrowserLocale } from "../../shared/types.js";
import { BROWSER_SHELL_CHANNELS } from "./browser-ipc-channels.js";
import { MAX_BROWSER_FIND_QUERY_LENGTH } from "./browser-tab-find.js";
import type { BrowserWindowManager } from "./browser-window-manager.js";

const MAX_BROWSER_TAB_ID_LENGTH = 128;

export function registerBrowserShellIpc(
  ipcMain: IpcMain,
  manager: BrowserWindowManager,
): void {
  const S = BROWSER_SHELL_CHANNELS;
  onShell(ipcMain, manager, S.ready, (_event, locale) =>
    manager.onShellReady(browserLocale(locale)));
  onShell(ipcMain, manager, S.requestState, () => manager.pushState());
  onShell(ipcMain, manager, S.newTab, () => manager.shellCommands.newTab());
  onShell(ipcMain, manager, S.closeTab, (_event, tabId) => {
    if (validTabId(tabId)) manager.tabs?.closeTab(tabId);
  });
  onShell(ipcMain, manager, S.selectTab, (_event, tabId) => {
    if (validTabId(tabId)) manager.tabs?.select(tabId);
  });
  onShell(ipcMain, manager, S.navigate, (_event, url) => {
    const target = normalizeBrowserNavigationUrl(url);
    if (target) manager.navigate(target);
  });
  onShell(ipcMain, manager, S.goBack, () => manager.goBack());
  onShell(ipcMain, manager, S.goForward, () => manager.goForward());
  onShell(ipcMain, manager, S.reload, () => manager.reload());
  onShell(ipcMain, manager, S.stopLoading, () => manager.stopLoading());
  onShell(ipcMain, manager, S.chromeHeight, (_event, height) => {
    if (validChromeHeight(height)) manager.shellCommands.setChromeHeight(height);
  });
  onShell(ipcMain, manager, S.minimize, () => manager.minimize());
  onShell(ipcMain, manager, S.toggleMaximize, () => manager.toggleMaximize());
  onShell(ipcMain, manager, S.closeWindow, () => manager.close());
  onShell(ipcMain, manager, S.pauseAgent, () => runAgentCommand(manager, "pause"));
  onShell(ipcMain, manager, S.resumeAgent, () => runAgentCommand(manager, "resume"));
  onShell(ipcMain, manager, S.takeoverAgent, () => runAgentCommand(manager, "takeover"));
  onShell(ipcMain, manager, S.stopAgent, () => runAgentCommand(manager, "stop"));
  onShell(ipcMain, manager, S.dismissPermissionNotice, () =>
    manager.dismissPermissionNotice());
  onShell(ipcMain, manager, S.dismissDownload, (_event, downloadId) => {
    if (validDownloadId(downloadId)) manager.dismissDownload(downloadId);
  });
  onShell(ipcMain, manager, S.toggleDownloadPopover, () =>
    manager.toggleDownloadPopover());
  onShell(ipcMain, manager, S.openPageInApp, () => manager.openPageInApp());
  onShell(ipcMain, manager, S.toggleAgentInspector, () =>
    manager.shellCommands.toggleAgentInspector());
  onShell(ipcMain, manager, S.searchFind, (_event, query) => {
    if (validFindQuery(query)) manager.shellCommands.searchFind(query);
  });
  onShell(ipcMain, manager, S.findNext, (_event, direction) => {
    if (validFindDirection(direction)) manager.shellCommands.findNext(direction);
  });
  onShell(ipcMain, manager, S.closeFind, () => manager.shellCommands.closeFind());
  onShell(ipcMain, manager, S.resetZoom, () => manager.shellCommands.resetZoom());
}

type ShellListener = (event: IpcMainEvent, ...args: unknown[]) => void;

function onShell(
  ipcMain: IpcMain,
  manager: BrowserWindowManager,
  channel: string,
  listener: ShellListener,
): void {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    if (event.sender !== manager.shellWebContents()) return;
    listener(event, ...args);
  });
}

function runAgentCommand(
  manager: BrowserWindowManager,
  command: "pause" | "resume" | "takeover" | "stop",
): void {
  void manager.agentStatus.command(command).catch(() => {});
}

function browserLocale(value: unknown): BrowserLocale | undefined {
  return value === "zh-CN" || value === "en-US" ? value : undefined;
}

function validTabId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_BROWSER_TAB_ID_LENGTH;
}

function validDownloadId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function validChromeHeight(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value > 0 && value <= 1_000;
}

function validFindQuery(query: unknown): query is string {
  return typeof query === "string" && query.length <= MAX_BROWSER_FIND_QUERY_LENGTH;
}

function validFindDirection(
  direction: unknown,
): direction is "next" | "previous" {
  return direction === "next" || direction === "previous";
}
