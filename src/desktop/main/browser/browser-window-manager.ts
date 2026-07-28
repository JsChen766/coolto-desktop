import { BrowserWindow, type WebContents } from "electron";

import type {
  BrowserOpenInput,
  BrowserState,
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
import { pickLocalFiles } from "./browser-file-uploader.js";
import {
  BrowserPageOperatorImpl,
  type ActiveTabContext,
  type ActiveTabResolver,
  type FilePicker,
  type ReviewStarter,
  type WriteAccessLifecycle,
} from "./browser-page-operator.js";
import { BrowserReviewOrchestrator } from "./browser-review-orchestrator.js";
import {
  createBrowserWindow,
  deriveShellState,
} from "./browser-window-factory.js";
import { BrowserWriteAccessGate } from "./browser-write-access-gate.js";
import { BrowserTabManager } from "./browser-tab-manager.js";
import {
  IDLE_BROWSER_STATE,
  type BrowserWindowEmitters,
} from "./browser-window-state.js";

export type { BrowserWindowEmitters } from "./browser-window-state.js";

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
  readonly #review: BrowserReviewOrchestrator;

  public constructor(emitters: BrowserWindowEmitters) {
    this.#emitters = emitters;
    const resolver: ActiveTabResolver = { resolve: () => this.#resolveActive() };
    const reviewStarter: ReviewStarter = {
      start: (records) => this.#review.startReview(records),
    };
    const lifecycle: WriteAccessLifecycle = {
      onGranted: () => this.#review.startCaptchaProbe(),
      onRevoked: () => {
        this.#review.stopCaptchaProbe();
        this.#review.stopOverlay();
      },
    };
    const filePicker: FilePicker = {
      pick: (options) => pickLocalFiles(this.#activeWindow(), options),
    };
    this.#operator = new BrowserPageOperatorImpl(
      this.#writeAccess,
      resolver,
      reviewStarter,
      lifecycle,
      filePicker,
    );
    this.#originTracker = new BrowserActiveOriginTracker(this.#writeAccess);
    this.#review = new BrowserReviewOrchestrator({
      operator: this.#operator,
      activeWebContents: () => activeTabContext(this.#tabs)?.webContents,
      emitFillProgress: emitters.emitFillProgress,
      emitReviewDecision: emitters.emitReviewDecision,
      emitReviewComplete: emitters.emitReviewComplete,
      emitCaptchaDetected: emitters.emitCaptchaDetected,
    });
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
  }  public get tabs(): BrowserTabManager | undefined {
    return this.#tabs;
  }

  public shellWebContents(): WebContents | undefined {
    if (!this.#window || this.#window.isDestroyed()) return undefined;
    return this.#window.webContents;
  }

  public getState(): BrowserState {
    if (!this.#window || this.#window.isDestroyed() || !this.#tabs) {
      return { ...IDLE_BROWSER_STATE };
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

  #activeWindow(): BrowserWindow | undefined {
    return this.#window && !this.#window.isDestroyed()
      ? this.#window
      : undefined;
  }

  public pushState(): void {
    this.#originTracker.sync(this.#tabs);
    this.#emitters.emitState(this.getState());
    if (this.#tabs) this.#emitters.emitShellState(this.#shellState());
  }

  /**
   * B4: 用户点「中止填写」→ 转入 Overlay 让用户逐字段决定，
   * 已写入字段不能绕过审核直接生效。
   */
  public abortFill(): void {
    this.#review.abortFill();
  }

  public dispose(): void {
    this.#review.dispose();
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
    return deriveShellState(
      this.#tabs,
      this.#theme,
      this.#window?.isMaximized() ?? false,
    );
  }

  #createWindow(): BrowserWindow {
    return createBrowserWindow({
      theme: () => this.#theme,
      onCreated: (tabs) => {
        this.#tabs = tabs;
      },
      onLayoutChange: () => this.pushState(),
      onClosed: (window) => {
        if (this.#window !== window) return;
        this.#tabs = undefined;
        this.#window = undefined;
        this.#emitters.emitState({ ...IDLE_BROWSER_STATE });
      },
    });
  }

  #requireTabs(): BrowserTabManager {
    if (!this.#tabs) throw new Error("浏览器窗口尚未打开");
    return this.#tabs;
  }
}
