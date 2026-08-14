import { join } from "node:path";

import { app, BrowserWindow } from "electron";

import type {
  BrowserShellState,
  DesktopPlatform,
} from "../../shared/types.js";
import { getBrowserSession } from "./browser-session.js";
import { BrowserTabManager } from "./browser-tab-manager.js";

/**
 * B1: 抽离 BrowserWindow 创建 + shell 加载 + shell state 派生，
 * 让 BrowserWindowManager 专注编排。所有渲染进程隔离/session
 * 配置集中在此。
 */

export interface BrowserWindowFactoryDeps {
  theme: () => "light" | "dark";
  onCreated: (tabs: BrowserTabManager, window: BrowserWindow) => void;
  onClosed: (window: BrowserWindow) => void;
  onLayoutChange: () => void;
}

export function createBrowserWindow(
  deps: BrowserWindowFactoryDeps,
): BrowserWindow {
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: deps.theme() === "dark" ? "#1b1b19" : "#fbfbfa",
    title: "Coolto 浏览器",
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 14, y: 20 },
        }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, "../preload/browser-shell.cjs"),
      session: getBrowserSession(),
      contextIsolation: true,
      devTools: !app.isPackaged,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const tabs = new BrowserTabManager(window, deps.onLayoutChange);
  deps.onCreated(tabs, window);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.on("resize", () => tabs.layout());
  window.on("maximize", () => deps.onLayoutChange());
  window.on("unmaximize", () => deps.onLayoutChange());
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => deps.onClosed(window));
  void loadShell(window);
  return window;
}

function loadShell(window: BrowserWindow): Promise<void> {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    return window.webContents.loadURL(
      `${process.env.ELECTRON_RENDERER_URL}/browser-shell.html`,
    );
  }
  return window.webContents.loadFile(
    join(__dirname, "../renderer/browser-shell.html"),
  );
}

export function deriveShellState(
  tabs: BrowserTabManager | undefined,
  theme: "light" | "dark",
  isMaximized: boolean,
): BrowserShellState {
  const base = tabs?.shellState() ?? { tabs: [], activeTabId: null };
  return {
    ...base,
    theme,
    platform: process.platform as DesktopPlatform,
    isMaximized,
  };
}
