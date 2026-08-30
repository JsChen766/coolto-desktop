import assert from "node:assert/strict";
import test from "node:test";

import type { IpcMain, IpcMainEvent, WebContents } from "electron";

import { BROWSER_DOWNLOAD_POPOVER_CHANNELS as C } from
  "../src/desktop/main/browser/browser-ipc-channels.js";
import { registerBrowserDownloadPopoverIpc } from
  "../src/desktop/main/browser/browser-download-popover-ipc.js";
import type { BrowserWindowManager } from
  "../src/desktop/main/browser/browser-window-manager.js";

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

test("download popover IPC requires its trusted visible WebContentsView", () => {
  const ipc = new FakeIpcMain();
  const popover = {} as WebContents;
  const calls: string[] = [];
  let open = false;
  const manager = {
    dismissDownload: (id: string) => calls.push(`dismiss:${id}`),
    shellCommands: {
      get isDownloadPopoverOpen() { return open; },
      downloadPopoverWebContents: () => popover,
      onDownloadPopoverReady: () => calls.push("ready"),
      closeDownloadPopover: () => calls.push("close"),
    },
  } as unknown as BrowserWindowManager;
  registerBrowserDownloadPopoverIpc(ipc as unknown as IpcMain, manager);

  ipc.emit(C.ready, {});
  ipc.emit(C.ready, popover);
  ipc.emit(C.close, popover);
  ipc.emit(C.dismiss, popover, "download-1");
  assert.deepEqual(calls, ["ready"]);

  open = true;
  ipc.emit(C.dismiss, popover, "x".repeat(129));
  ipc.emit(C.dismiss, popover, "download-1");
  ipc.emit(C.close, popover);
  assert.deepEqual(calls, ["ready", "dismiss:download-1", "close"]);
});
