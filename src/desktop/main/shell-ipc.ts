import { shell, type IpcMain } from "electron";

export function registerShellIpc(ipcMain: IpcMain): void {
  ipcMain.handle("shell:open-external", (_event, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("仅支持打开 http(s) 链接");
    }
    return shell.openExternal(url);
  });
}

export const SHELL_IPC_CHANNELS = ["shell:open-external"] as const;
