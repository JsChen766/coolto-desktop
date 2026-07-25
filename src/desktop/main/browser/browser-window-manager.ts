import { join } from "node:path";

import { BrowserWindow, type WebContents } from "electron";

import type {
  BrowserOpenInput,
  BrowserShellState,
  BrowserState,
  DesktopPlatform,
} from "../../shared/types.js";
import type {
  BrowserPageOperator,
  BrowserPageReader,
  PageSnapshot,
} from "../../../browser/types.js";
import {
  BrowserActiveOriginTracker,
  activeTabContext,
} from "./browser-active-tab.js";
import { readPageSnapshot } from "./browser-content-reader.js";
import {
  BrowserPageOperatorImpl,
  type ActiveTabContext,
  type ActiveTabResolver,
} from "./browser-page-operator.js";
import { BrowserWriteAccessGate } from "./browser-write-access-gate.js";
import { getBrowserSession } from "./browser-session.js";
import { BrowserTabManager } from "./browser-tab-manager.js";

const IDLE_STATE: BrowserState = {
  isOpen: false,
  currentUrl: null,
  pageTitle: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  pageType: "unknown",
  fillStatus: "idle",
};

export interface BrowserWindowEmitters {
  emitState: (state: BrowserState) => void;
  emitShellState: (state: BrowserShellState) => void;
}

/**
 * B1（B0-D1 修订）: 内置浏览器窗口。主 webContents 加载 Vue chrome
 * （标签栏 + 地址栏 + 导航 + 嵌入式窗口控制按钮），页面内容用多个
 * WebContentsView 承载。单例：同一时间只允许一个浏览器窗口。
 * 无原生边框/菜单栏，与 App 主窗口一致的嵌入式设计。
 */
export class BrowserWindowManager implements BrowserPageReader {
  #window: BrowserWindow | undefined;
  #tabs: BrowserTabManager | undefined;
  #pendingUrl: string | undefined;
  #theme: "light" | "dark" = "light";
  readonly #emitters: BrowserWindowEmitters;
  readonly #writeAccess = new BrowserWriteAccessGate();
  readonly #operator: BrowserPageOperatorImpl;
  readonly #originTracker: BrowserActiveOriginTracker;

  public constructor(emitters: BrowserWindowEmitters) {
    this.#emitters = emitters;
    const resolver: ActiveTabResolver = { resolve: () => this.#resolveActive() };
    this.#operator = new BrowserPageOperatorImpl(this.#writeAccess, resolver);
    this.#originTracker = new BrowserActiveOriginTracker(this.#writeAccess);
  }

  /** B3: 暴露操作接口给 Agent 工具链（经 IPC 桥接注入 runtime）。 */
  public get pageOperator(): BrowserPageOperator {
    return this.#operator;
  }

  public open(input?: BrowserOpenInput): BrowserState {
    if (input?.theme) this.#theme = input.theme;
    const url = input?.url?.trim();
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.focus();
      if (url) this.#tabs?.newTab(url);
      this.pushState();
      return this.getState();
    }
    this.#pendingUrl = url;
    this.#window = this.#createWindow();
    return this.getState();
  }

  public close(): void {
    if (this.#window && !this.#window.isDestroyed()) this.#window.close();
  }

  public navigate(url: string): void {
    this.#requireTabs().activeTab()?.navigate(url);
  }

  public goBack(): void {
    this.#requireTabs().activeTab()?.goBack();
  }

  public goForward(): void {
    this.#requireTabs().activeTab()?.goForward();
  }

  public reload(): void {
    this.#requireTabs().activeTab()?.reload();
  }

  public minimize(): void {
    this.#window?.minimize();
  }

  public toggleMaximize(): void {
    if (!this.#window || this.#window.isDestroyed()) return;
    if (this.#window.isMaximized()) this.#window.unmaximize();
    else this.#window.maximize();
  }

  public get tabs(): BrowserTabManager | undefined {
    return this.#tabs;
  }

  public shellWebContents(): WebContents | undefined {
    if (!this.#window || this.#window.isDestroyed()) return undefined;
    return this.#window.webContents;
  }

  public getState(): BrowserState {
    if (!this.#window || this.#window.isDestroyed() || !this.#tabs) {
      return { ...IDLE_STATE };
    }
    return this.#tabs.browserState();
  }

  /** B2: 只读读取当前活跃标签页快照；浏览器未打开或无活跃标签则抛错。 */
  public async readActivePage(): Promise<PageSnapshot> {
    if (!this.#window || this.#window.isDestroyed() || !this.#tabs) {
      throw new Error("浏览器尚未打开，请先让用户打开要读取的页面");
    }
    const active = this.#tabs.activeTab();
    if (!active) {
      throw new Error("浏览器没有活跃标签页，请先让用户打开要读取的页面");
    }
    return readPageSnapshot(active.view.webContents);
  }

  // ---------- 内部：活跃标签解析 + 导航联动 ----------

  #resolveActive(): ActiveTabContext {
    const ctx = activeTabContext(this.#tabs);
    if (!ctx) {
      throw new Error("浏览器尚未打开或无活跃标签页，请先让用户打开要操作的页面");
    }
    return ctx;
  }

  public pushState(): void {
    this.#originTracker.sync(this.#tabs);
    this.#emitters.emitState(this.getState());
    if (this.#tabs) this.#emitters.emitShellState(this.#shellState());
  }

  public dispose(): void {
    this.#tabs?.destroyAll();
    this.#tabs = undefined;
    if (this.#window && !this.#window.isDestroyed()) this.#window.destroy();
    this.#window = undefined;
  }

  /** chrome renderer 就绪后调用，创建首个标签页。 */
  public onShellReady(): void {
    if (!this.#tabs || this.#tabs.hasTabs()) {
      this.pushState();
      return;
    }
    this.#tabs.newTab(this.#pendingUrl);
    this.#pendingUrl = undefined;
  }

  #shellState(): BrowserShellState {
    const base = this.#tabs?.shellState() ?? { tabs: [], activeTabId: null };
    return {
      ...base,
      theme: this.#theme,
      platform: process.platform as DesktopPlatform,
      isMaximized: this.#window?.isMaximized() ?? false,
    };
  }

  #createWindow(): BrowserWindow {
    const isMac = process.platform === "darwin";
    const window = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 720,
      minHeight: 520,
      show: false,
      backgroundColor: this.#theme === "dark" ? "#1b1b19" : "#fbfbfa",
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
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.#tabs = new BrowserTabManager(window, () => this.pushState());
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.on("resize", () => this.#tabs?.layout());
    window.on("maximize", () => this.pushState());
    window.on("unmaximize", () => this.pushState());
    window.once("ready-to-show", () => window.show());
    window.on("closed", () => {
      if (this.#window !== window) return;
      this.#tabs = undefined;
      this.#window = undefined;
      this.#emitters.emitState({ ...IDLE_STATE });
    });
    void this.#loadShell(window);
    return window;
  }

  #loadShell(window: BrowserWindow): Promise<void> {
    if (process.env.ELECTRON_RENDERER_URL) {
      return window.webContents.loadURL(
        `${process.env.ELECTRON_RENDERER_URL}/browser-shell.html`,
      );
    }
    return window.webContents.loadFile(
      join(__dirname, "../renderer/browser-shell.html"),
    );
  }

  #requireTabs(): BrowserTabManager {
    if (!this.#tabs) throw new Error("浏览器窗口尚未打开");
    return this.#tabs;
  }
}
