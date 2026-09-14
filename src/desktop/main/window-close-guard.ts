import { dialog, type BrowserWindow, type IpcMain } from "electron";

import type { WindowDraftSaveState } from "../shared/types.js";
import { resolveWindowCloseAction } from "./window-close-policy.js";

export const WINDOW_CLOSE_IPC_CHANNELS = [
  "window:draft-save-state",
  "window:save-before-close-complete",
] as const;

export class WindowCloseGuard {
  private state: WindowDraftSaveState = "saved";
  private forceClose = false;
  private prompting = false;
  private pending: "hide" | "quit" | undefined;

  public constructor(
    private readonly window: BrowserWindow,
    private readonly shouldHide: () => boolean = () => true,
  ) {
    window.on("close", (event) => {
      const action = resolveWindowCloseAction({
        forceClose: this.forceClose,
        quitting: !this.shouldHide(),
        draftState: this.state,
      });
      if (action === "allow") return;
      event.preventDefault();
      if (action === "hide") {
        this.window.hide();
        return;
      }
      void this.prompt(action === "prompt-hide" ? "hide" : "quit");
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
    if (this.pending === "hide") {
      this.pending = undefined;
      this.window.hide();
      return;
    }
    this.forceClose = true;
    this.window.close();
  }

  private async prompt(mode: "hide" | "quit"): Promise<void> {
    if (this.prompting || this.window.isDestroyed()) return;
    this.prompting = true;
    this.pending = mode;
    try {
      const failed = this.state === "error";
      const hiding = mode === "hide";
      const result = await dialog.showMessageBox(this.window, {
        type: failed ? "error" : "warning",
        title: failed ? "本地自动保存失败" : "还有修改尚未保存",
        message: failed
          ? hiding
            ? "最近的简历修改没有成功保存到本机，直接关闭窗口可能丢失内容"
            : "最近的简历修改没有成功保存到本机，直接退出可能丢失内容"
          : hiding
            ? "是否先把当前简历修改保存到本机再关闭窗口？"
            : "是否先把当前简历修改保存到本机再退出？",
        detail: failed
          ? "建议返回应用重试；也可以仅保留最后一次成功保存的本地草稿"
          : "简历库保存和 PDF 导出不影响本地自动草稿",
        buttons: hiding
          ? ["保存本地草稿并关闭到托盘", "保留上次本地草稿并关闭到托盘", "取消"]
          : ["保存本地草稿并退出", "保留上次本地草稿并退出", "取消"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (result.response === 0 && !this.window.webContents.isDestroyed()) {
        this.window.webContents.send("window:save-before-close");
      } else if (result.response === 1) {
        this.state = "saved";
        if (hiding) this.window.hide();
        else {
          this.forceClose = true;
          this.window.close();
        }
      } else {
        this.pending = undefined;
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
