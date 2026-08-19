import { dialog, type BrowserWindow, type IpcMain } from "electron";

import type { WindowDraftSaveState } from "../shared/types.js";

export const WINDOW_CLOSE_IPC_CHANNELS = [
  "window:draft-save-state",
  "window:save-before-close-complete",
] as const;

export class WindowCloseGuard {
  private state: WindowDraftSaveState = "saved";
  private forceClose = false;
  private prompting = false;

  public constructor(private readonly window: BrowserWindow) {
    window.on("close", (event) => {
      if (this.forceClose || this.state === "saved" || this.state === "idle") return;
      event.preventDefault();
      void this.prompt();
    });
  }

  public requestClose(): void {
    this.window.close();
  }

  public report(state: WindowDraftSaveState): void {
    this.state = state;
  }

  public completeSave(success: boolean): void {
    if (!success) {
      this.state = "error";
      return;
    }
    this.state = "saved";
    this.forceClose = true;
    this.window.close();
  }

  private async prompt(): Promise<void> {
    if (this.prompting || this.window.isDestroyed()) return;
    this.prompting = true;
    try {
      const failed = this.state === "error";
      const result = await dialog.showMessageBox(this.window, {
        type: failed ? "error" : "warning",
        title: failed ? "本地自动保存失败" : "还有修改尚未保存",
        message: failed
          ? "最近的简历修改没有成功保存到本机，直接退出可能丢失内容"
          : "是否先把当前简历修改保存到本机再退出？",
        detail: failed
          ? "建议返回应用重试；也可以仅保留最后一次成功保存的本地草稿并退出"
          : "简历库保存和 PDF 导出不影响本地自动草稿",
        buttons: [
          "保存本地草稿并退出",
          "保留上次本地草稿并退出",
          "取消",
        ],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (result.response === 0 && !this.window.webContents.isDestroyed()) {
        this.window.webContents.send("window:save-before-close");
      } else if (result.response === 1) {
        this.forceClose = true;
        this.window.close();
      }
    } finally {
      this.prompting = false;
    }
  }
}

export function registerWindowCloseGuardIpc(
  ipcMain: IpcMain,
  guard: WindowCloseGuard,
): void {
  ipcMain.handle("window:draft-save-state", (_event, state: unknown) => {
    if (!isSaveState(state)) throw new Error("窗口保存状态无效");
    guard.report(state);
  });
  ipcMain.handle(
    "window:save-before-close-complete",
    (_event, success: unknown) => {
      if (typeof success !== "boolean") throw new Error("窗口保存结果无效");
      guard.completeSave(success);
    },
  );
}

function isSaveState(value: unknown): value is WindowDraftSaveState {
  return ["idle", "dirty", "saving", "saved", "error"].includes(String(value));
}
