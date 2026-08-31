import assert from "node:assert/strict";
import test from "node:test";

import type { IpcMain, IpcMainEvent, WebContents } from "electron";

import { BROWSER_SHELL_CHANNELS } from "../src/desktop/main/browser/browser-ipc-channels.js";
import { registerBrowserShellIpc } from "../src/desktop/main/browser/browser-shell-ipc.js";
import type { BrowserWindowManager } from "../src/desktop/main/browser/browser-window-manager.js";

type Listener = (event: IpcMainEvent, ...args: unknown[]) => void;

class FakeIpcMain {
  readonly listeners = new Map<string, Listener>();
  public on(channel: string, listener: Listener): this {
    this.listeners.set(channel, listener);
    return this;
  }
  public emit(channel: string, sender: object, ...args: unknown[]): void {
    this.listeners.get(channel)?.({ sender } as IpcMainEvent, ...args);
  }
}

test("browser shell IPC rejects foreign senders and invalid payloads", () => {
  const ipc = new FakeIpcMain();
  const shellSender = {} as WebContents;
  const calls: string[] = [];
  const manager = {
    shellWebContents: () => shellSender,
    navigate: (url: string) => calls.push(`navigate:${url}`),
    dismissDownload: (id: string) => calls.push(`dismiss-download:${id}`),
    toggleDownloadPopover: () => calls.push("toggle-downloads"),
    openPageInApp: () => calls.push("open-page-in-app"),
    shellCommands: {
      newTab: () => calls.push("new-tab"),
      searchFind: (query: string) => calls.push(`search:${query}`),
      findNext: (direction: string) => calls.push(`find-next:${direction}`),
      closeFind: () => calls.push("close-find"),
      resetZoom: () => calls.push("reset-zoom"),
      setChromeHeight: (height: number) => calls.push(`height:${height}`),
    },
    tabs: {
      closeTab: (id: string) => calls.push(`close:${id}`),
      select: (id: string) => calls.push(`select:${id}`),
    },
  } as unknown as BrowserWindowManager;
  registerBrowserShellIpc(ipc as unknown as IpcMain, manager);
  const S = BROWSER_SHELL_CHANNELS;

  ipc.emit(S.newTab, {});
  ipc.emit(S.navigate, {}, "https://example.com");
  assert.deepEqual(calls, []);

  ipc.emit(S.closeTab, shellSender, "");
  ipc.emit(S.selectTab, shellSender, "x".repeat(129));
  ipc.emit(S.navigate, shellSender, 42);
  ipc.emit(S.navigate, shellSender, "data:text/html,unsafe");
  ipc.emit(S.chromeHeight, shellSender, Number.NaN);
  ipc.emit(S.searchFind, shellSender, "x".repeat(1_001));
  ipc.emit(S.findNext, shellSender, "sideways");
  ipc.emit(S.dismissDownload, shellSender, "x".repeat(129));
  assert.deepEqual(calls, []);

  ipc.emit(S.newTab, shellSender);
  ipc.emit(S.closeTab, shellSender, "tab-1");
  ipc.emit(S.selectTab, shellSender, "tab-2");
  ipc.emit(S.navigate, shellSender, "https://example.com");
  ipc.emit(S.chromeHeight, shellSender, 84.4);
  ipc.emit(S.searchFind, shellSender, "needle");
  ipc.emit(S.findNext, shellSender, "previous");
  ipc.emit(S.closeFind, shellSender);
  ipc.emit(S.resetZoom, shellSender);
  ipc.emit(S.toggleDownloadPopover, shellSender);
  ipc.emit(S.dismissDownload, shellSender, "download-1");
  ipc.emit(S.openPageInApp, shellSender);
  assert.deepEqual(calls, [
    "new-tab",
    "close:tab-1",
    "select:tab-2",
    "navigate:https://example.com/",
    "height:84.4",
    "search:needle",
    "find-next:previous",
    "close-find",
    "reset-zoom",
    "toggle-downloads",
    "dismiss-download:download-1",
    "open-page-in-app",
  ]);
});
