import { BrowserWindow, type WebContents } from "electron";

import type { BrowserOpenInput, BrowserShellState, BrowserState } from "../../shared/types.js";
import type { BrowserPageOperator } from "../../../browser/types.js";
import type { BrowserAgentController } from "../../../browser/agent-control-types.js";
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
import { createBrowserWindow, deriveShellState } from "./browser-window-factory.js";
import { BrowserWriteAccessGate } from "./browser-write-access-gate.js";
import { BrowserTabManager } from "./browser-tab-manager.js";
import { BrowserAgentControllerImpl } from "./browser-agent-controller.js";
import { BrowserAgentStatusBridge } from "./browser-agent-status-bridge.js";
import {
  IDLE_BROWSER_STATE,
  type BrowserWindowEmitters,
} from "./browser-window-state.js";

export type { BrowserWindowEmitters } from "./browser-window-state.js";

export class BrowserWindowManager {
  #window: BrowserWindow | undefined;
  #tabs: BrowserTabManager | undefined;
  #pendingUrl: string | undefined;
  #pendingDisplayUrl: string | undefined;
  #theme: "light" | "dark" = "light";
  readonly #emitters: BrowserWindowEmitters;
  readonly #writeAccess = new BrowserWriteAccessGate();
  readonly #operator: BrowserPageOperatorImpl;
  readonly #agentController: BrowserAgentControllerImpl;
  readonly #agentStatus = new BrowserAgentStatusBridge(() => this.pushState());
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
    this.#agentController = new BrowserAgentControllerImpl({
      tabs: () => this.#tabs,
      activeContext: () => this.#resolveActive(),
      requireControlAccess: () => this.#requireControlAccess(),
      readPage: (context) => readPageSnapshot(context.webContents),
    });
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

  public get agentController(): BrowserAgentController {
    return this.#agentController;
  }

  public get agentStatus(): BrowserAgentStatusBridge {
    return this.#agentStatus;
  }

  public open(input?: BrowserOpenInput): BrowserState {
    if (input?.theme) this.#theme = input.theme;
    const url = input?.url?.trim();
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.focus();
      if (url) this.#tabs?.newTab(url, this.#pendingDisplayUrl);
      this.#pendingDisplayUrl = undefined;
      this.pushState();
      return this.getState();
    }
    this.#pendingUrl = url;
    this.#window = this.#createWindow();
    return this.getState();
  }

  public openOnboardingDemo(url: string, theme: "light" | "dark"): BrowserState {
    this.#pendingDisplayUrl = "coolto://onboarding/example-application";
    return this.open({ url, theme });
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

  #requireControlAccess(): void {
    const check = this.#operator.checkWriteAccess();
    if (!check.ok) throw new Error(check.message);
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
    this.#agentController.dispose();
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
    this.#tabs.newTab(this.#pendingUrl, this.#pendingDisplayUrl);
    this.#pendingUrl = undefined;
    this.#pendingDisplayUrl = undefined;
  }

  #shellState(): BrowserShellState {
    return deriveShellState(
      this.#tabs,
      this.#theme,
      this.#window?.isMaximized() ?? false,
      this.#agentStatus.get(),
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
