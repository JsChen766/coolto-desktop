import assert from "node:assert/strict";
import test from "node:test";

import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";

import { BROWSER_IPC_CHANNELS } from "../src/desktop/main/browser/browser-ipc-channels.js";
import { registerBrowserMainIpc } from "../src/desktop/main/browser/browser-main-ipc.js";
import type { BrowserWindowManager } from "../src/desktop/main/browser/browser-window-manager.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();
  public handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler);
  }
  public invoke(channel: string, sender: object, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`missing handler: ${channel}`);
    return Promise.resolve().then(() => handler({ sender } as IpcMainInvokeEvent, ...args));
  }
}

test("main browser IPC validates sender and runtime payloads", async () => {
  const ipc = new FakeIpcMain();
  const mainSender = {} as WebContents;
  const calls: unknown[] = [];
  const manager = {
    open: (input: unknown) => { calls.push(["open", input]); return "opened"; },
    navigate: (url: string) => calls.push(["navigate", url]),
  } as unknown as BrowserWindowManager;
  registerBrowserMainIpc(ipc as unknown as IpcMain, mainSender, manager);
  const C = BROWSER_IPC_CHANNELS;

  await assert.rejects(() => ipc.invoke(C.open, {}, undefined), /Unauthorized/u);
  await assert.rejects(() => ipc.invoke(C.open, mainSender, { theme: "blue" }),
    /theme/u);
  await assert.rejects(() => ipc.invoke(C.open, mainSender, { extra: true }),
    /Unknown/u);
  await assert.rejects(() => ipc.invoke(C.navigate, mainSender, {
    url: "data:text/html,unsafe",
  }), /navigation URL/u);
  assert.deepEqual(calls, []);

  assert.equal(await ipc.invoke(C.open, mainSender, {
    locale: "zh-CN", theme: "dark", url: "https://example.com/path",
  }), "opened");
  await ipc.invoke(C.navigate, mainSender, { url: "http://127.0.0.1:8080/" });
  assert.deepEqual(calls, [
    ["open", {
      locale: "zh-CN", theme: "dark", url: "https://example.com/path",
    }],
    ["navigate", "http://127.0.0.1:8080/"],
  ]);
});
