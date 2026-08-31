import { contextBridge, ipcRenderer } from "electron";

import type {
  BrowserAgentInspectorApi,
  BrowserAgentInspectorViewState,
} from "../shared/types.js";

// Sandboxed Electron preloads must remain single-file bundles. A runtime import
// shared with browser-shell preload makes Rollup emit a sibling require(), which
// the sandboxed preload loader cannot resolve.
const C = {
  ready: "browser-agent-inspector:ready",
  stateChanged: "browser-agent-inspector:state-changed",
  focus: "browser-agent-inspector:focus",
  close: "browser-agent-inspector:close",
  command: "browser-agent-inspector:command",
  openTask: "browser-agent-inspector:open-task",
} as const satisfies typeof import(
  "../main/browser/browser-ipc-channels.js"
).BROWSER_AGENT_INSPECTOR_CHANNELS;

const api: BrowserAgentInspectorApi = {
  ready: (reducedMotion) => ipcRenderer.send(C.ready, reducedMotion),
  close: () => ipcRenderer.send(C.close),
  command: (action) => ipcRenderer.send(C.command, action),
  openTask: () => ipcRenderer.send(C.openTask),
  onStateChanged: (listener) => subscribe(C.stateChanged, listener),
  onFocus: (listener) => subscribe(C.focus, listener),
};

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T): void => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("browserAgentInspector", api);
