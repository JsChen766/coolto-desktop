import { ipcRenderer } from "electron";

export function childApi(channel: "interviews" | "notes" | "reminders") {
  return {
    prepareCreate: (input: unknown) => ipcRenderer.invoke(`${channel}:prepare-create`, input),
    prepareUpdate: (input: unknown) => ipcRenderer.invoke(`${channel}:prepare-update`, input),
    prepareDelete: (id: string) => ipcRenderer.invoke(`${channel}:prepare-delete`, id),
    executeProposal: (id: string) => ipcRenderer.invoke(`${channel}:execute-proposal`, id),
  };
}

export function subscribeIpc<T>(
  channel: string,
  listener: (payload: T) => void,
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
