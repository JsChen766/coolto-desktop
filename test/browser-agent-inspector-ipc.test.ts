import assert from "node:assert/strict";
import test from "node:test";

import type { IpcMain, IpcMainEvent, WebContents } from "electron";

import { BROWSER_AGENT_INSPECTOR_CHANNELS as C } from
  "../src/desktop/main/browser/browser-ipc-channels.js";
import { registerBrowserAgentInspectorIpc } from
  "../src/desktop/main/browser/browser-agent-inspector-ipc.js";
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

test("agent inspector IPC requires the trusted visible inspector", async () => {
  const ipc = new FakeIpcMain();
  const inspector = {} as WebContents;
  const calls: string[] = [];
  let open = false;
  const manager = {
    agentStatus: {
      command: async (action: string) => {
        calls.push(`command:${action}`);
        return true;
      },
    },
    shellCommands: {
      get isAgentInspectorOpen() { return open; },
      inspectorWebContents: () => inspector,
      onAgentInspectorReady: (reducedMotion: boolean) =>
        calls.push(`ready:${reducedMotion}`),
      closeAgentInspector: () => calls.push("close"),
      closeAgentInspectorToPage: () => calls.push("close-to-page"),
    },
  } as unknown as BrowserWindowManager;
  registerBrowserAgentInspectorIpc(
    ipc as unknown as IpcMain,
    manager,
    () => calls.push("open-task"),
  );

  ipc.emit(C.command, {}, "pause");
  ipc.emit(C.ready, inspector, true);
  ipc.emit(C.command, inspector, "pause");
  ipc.emit(C.openTask, inspector);
  ipc.emit(C.close, inspector);
  await Promise.resolve();
  assert.deepEqual(calls, ["ready:true"]);

  open = true;
  ipc.emit(C.command, inspector, "invalid");
  ipc.emit(C.command, inspector, "takeover");
  ipc.emit(C.openTask, inspector);
  ipc.emit(C.close, inspector);
  await Promise.resolve();
  assert.deepEqual(calls, [
    "ready:true", "command:takeover", "open-task", "close", "close-to-page",
  ]);
});
