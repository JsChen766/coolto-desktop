import type { IpcMain, IpcMainEvent } from "electron";

import { BROWSER_AGENT_INSPECTOR_CHANNELS as C } from "./browser-ipc-channels.js";
import type { BrowserWindowManager } from "./browser-window-manager.js";

export function registerBrowserAgentInspectorIpc(
  ipcMain: IpcMain,
  manager: BrowserWindowManager,
  openTask: () => void,
): void {
  onInspector(ipcMain, manager, C.ready, (_event, reducedMotion) =>
    manager.shellCommands.onAgentInspectorReady(reducedMotion === true));
  onInspector(ipcMain, manager, C.close, () =>
    manager.shellCommands.closeAgentInspector(), true);
  onInspector(ipcMain, manager, C.command, (_event, action) => {
    if (!isCommand(action)) return;
    void manager.agentStatus.command(action).then((executed) => {
      if (executed && action === "takeover") {
        manager.shellCommands.closeAgentInspectorToPage();
      }
    }).catch(() => {});
  }, true);
  onInspector(ipcMain, manager, C.openTask, () => openTask(), true);
}

function onInspector(
  ipcMain: IpcMain,
  manager: BrowserWindowManager,
  channel: string,
  listener: (event: IpcMainEvent, ...args: unknown[]) => void,
  requireOpen = false,
): void {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    if (event.sender !== manager.shellCommands.inspectorWebContents()) return;
    if (requireOpen && !manager.shellCommands.isAgentInspectorOpen) return;
    listener(event, ...args);
  });
}

function isCommand(value: unknown): value is "pause" | "resume" | "takeover" | "stop" {
  return value === "pause" || value === "resume" ||
    value === "takeover" || value === "stop";
}
