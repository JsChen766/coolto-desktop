import type { BrowserWindow, IpcMain } from "electron";

import type {
  BrowserFieldWriteRecord,
  CaptchaDetection,
  FieldReviewDecision,
  ReviewOutcome,
} from "../../../browser/types.js";
import type {
  BrowserFillRecordView,
  BrowserShellState,
  BrowserState,
} from "../../shared/types.js";
import {
  BROWSER_AGENT_INSPECTOR_CHANNELS,
  BROWSER_DOWNLOAD_POPOVER_CHANNELS,
  BROWSER_INVOKE_CHANNELS,
  BROWSER_IPC_CHANNELS,
  BROWSER_SHELL_CHANNELS,
} from "./browser-ipc-channels.js";
import { registerBrowserAgentInspectorIpc } from "./browser-agent-inspector-ipc.js";
import { registerBrowserDownloadPopoverIpc } from "./browser-download-popover-ipc.js";
import { registerBrowserMainIpc } from "./browser-main-ipc.js";
import { registerBrowserShellIpc } from "./browser-shell-ipc.js";
import { BrowserWindowManager } from "./browser-window-manager.js";

/**
 * B1: 注册内置浏览器 IPC。
 * - 主窗口 invoke 通道：open/close/navigate/... + state-changed 推送
 * - chrome renderer 通道：ready / 新建/关闭/切换标签 / 导航 / shell-state 推送
 * B4 追加：browser:fill-progress / review-decision / review-complete /
 * captcha-detected 主进程→主窗口推送；browser:abort-fill 主窗口→主进程 invoke。
 * 主窗口关闭时销毁浏览器窗口。
 */
export function registerBrowserIpc(
  ipcMain: IpcMain,
  mainWindow: BrowserWindow,
): BrowserWindowManager {
  for (const channel of BROWSER_INVOKE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
  for (const channel of Object.values(BROWSER_SHELL_CHANNELS)) {
    ipcMain.removeAllListeners(channel);
  }
  for (const channel of Object.values(BROWSER_AGENT_INSPECTOR_CHANNELS)) {
    ipcMain.removeAllListeners(channel);
  }
  for (const channel of Object.values(BROWSER_DOWNLOAD_POPOVER_CHANNELS)) {
    ipcMain.removeAllListeners(channel);
  }

  const sendMain = (channel: string, payload?: unknown): void => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(channel, payload);
  };

  const manager = new BrowserWindowManager({
    emitState: (state: BrowserState) =>
      sendMain(BROWSER_IPC_CHANNELS.stateChanged, state),
    emitShellState: (state: BrowserShellState) =>
      broadcastShellState(manager, state),
    emitFillProgress: (records: BrowserFieldWriteRecord[], reviewing: boolean) =>
      sendMain(BROWSER_IPC_CHANNELS.fillProgress, {
        records: records.map(toRecordView),
        reviewing,
      }),
    emitReviewDecision: (fillId: string, decision: FieldReviewDecision) =>
      sendMain(BROWSER_IPC_CHANNELS.reviewDecision, { fillId, decision }),
    emitReviewComplete: (outcome: ReviewOutcome) =>
      sendMain(BROWSER_IPC_CHANNELS.reviewComplete, outcome),
    emitCaptchaDetected: (detection: CaptchaDetection) =>
      sendMain(BROWSER_IPC_CHANNELS.captchaDetected, detection),
    openAgentTask: (taskId: string) => {
      mainWindow.show();
      mainWindow.focus();
      sendMain(BROWSER_IPC_CHANNELS.openAgentTask, taskId);
    },
    openPageInApp: (page) => {
      mainWindow.show();
      mainWindow.focus();
      sendMain(BROWSER_IPC_CHANNELS.openPageInApp, page);
    },
  });

  registerBrowserMainIpc(ipcMain, mainWindow.webContents, manager);
  registerBrowserShellIpc(ipcMain, manager);
  registerBrowserDownloadPopoverIpc(ipcMain, manager);
  registerBrowserAgentInspectorIpc(ipcMain, manager, () => {
    manager.openAgentTask();
  });

  mainWindow.on("closed", () => manager.dispose());
  return manager;
}

function toRecordView(record: BrowserFieldWriteRecord): BrowserFillRecordView {
  return {
    fillId: record.fillId,
    label: record.label,
    elementType: record.elementType,
    writtenValue: record.valueAfter,
    decision: "pending",
  };
}

function broadcastShellState(
  manager: BrowserWindowManager,
  state: BrowserShellState,
): void {
  const contents = manager.shellWebContents();
  if (contents && !contents.isDestroyed()) {
    contents.send(BROWSER_SHELL_CHANNELS.stateChanged, state);
  }
}
