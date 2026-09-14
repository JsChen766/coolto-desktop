import type { WebContents } from "electron";
import type { BrowserLocale, BrowserOpenInput, BrowserState } from "../../shared/types.js";
import type { BrowserPageOperator } from "../../../browser/types.js";
import type { BrowserAgentController } from "../../../browser/agent-control-types.js";
import { BrowserActiveOriginTracker, activeTabContext } from "./browser-active-tab.js";
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
import { BrowserWriteAccessGate } from "./browser-write-access-gate.js";
import { BrowserTabManager } from "./browser-tab-manager.js";
import { BrowserAgentControllerImpl } from "./browser-agent-controller.js";
import { BrowserAgentStatusBridge } from "./browser-agent-status-bridge.js";
import { BrowserPermissionStatusBridge } from "./browser-permission-status-bridge.js";
import { BrowserWindowPresentation } from "./browser-window-presentation.js";
import { BrowserWindowHost } from "./browser-window-host.js";
import { browserHomeTaskSnapshot } from "./browser-home-page.js";
import { browserPageHandoff } from "../../../browser/browser-page-handoff.js";
import { IDLE_BROWSER_STATE, type BrowserWindowEmitters } from "./browser-window-state.js";
export type { BrowserWindowEmitters } from "./browser-window-state.js";
export class BrowserWindowManager {
  #pendingUrl: string | undefined;
  #pendingDisplayUrl: string | undefined;
  #pendingHostInternal = false;
  readonly #emitters: BrowserWindowEmitters;
  readonly #writeAccess = new BrowserWriteAccessGate();
  readonly #operator: BrowserPageOperatorImpl;
  readonly #agentController: BrowserAgentControllerImpl;
  readonly #agentStatus = new BrowserAgentStatusBridge(() =>
    this.#agentProjectionChanged());
  readonly #permissionStatus: BrowserPermissionStatusBridge;
  readonly #presentation = new BrowserWindowPresentation();
  readonly #originTracker: BrowserActiveOriginTracker;
  readonly #review: BrowserReviewOrchestrator;
  readonly #host: BrowserWindowHost;
  public constructor(emitters: BrowserWindowEmitters) {
    this.#emitters = emitters;
    this.#permissionStatus = new BrowserPermissionStatusBridge(() => this.pushState());
    this.#host = new BrowserWindowHost(
      this.#presentation,
      () => this.pushState(),
      () => this.#emitters.emitState({ ...IDLE_BROWSER_STATE }),
      () => browserHomeTaskSnapshot(this.#agentStatus.get()),
      () => this.openAgentTask(),
    );
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
      pick: (options) => pickLocalFiles(this.#host.window, options),
    };
    this.#operator = new BrowserPageOperatorImpl(
      this.#writeAccess,
      resolver,
      reviewStarter,
      lifecycle,
      filePicker,
    );
    this.#originTracker = new BrowserActiveOriginTracker(this.#writeAccess, lifecycle.onRevoked);
    this.#agentController = new BrowserAgentControllerImpl({
      tabs: () => this.#host.tabs,
      activeContext: () => this.#resolveActive(),
      requireControlAccess: () => this.#requireControlAccess(),
      readPage: (context) => readPageSnapshot(context.webContents),
      onDownloadsChanged: () => this.pushState(),
    });
    this.#review = new BrowserReviewOrchestrator({
      operator: this.#operator,
      activeWebContents: () => activeTabContext(this.#host.tabs)?.webContents,
      presentation: () => ({ locale: this.#presentation.locale, theme: this.#presentation.theme }),
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
  public get agentStatus(): BrowserAgentStatusBridge { return this.#agentStatus; }
  public openAgentTask(): void {
    const taskId = this.#agentStatus.taskId();
    if (taskId) this.#emitters.openAgentTask(taskId);
  }
  public openPageInApp(intent: "context" | "analyze_jd" = "context"): void {
    const tab = this.#host.tabs?.activeTab()?.getState();
    const page = tab ? browserPageHandoff(tab) : null;
    if (page) this.#emitters.openPageInApp({ ...page, intent });
  }
  public open(input?: BrowserOpenInput, hostInternal = false): BrowserState {
    const presentationChanged = this.#presentation.apply(input);
    const url = input?.url?.trim();
    if (this.#host.isOpen) {
      this.#host.focus();
      if (presentationChanged) this.#host.tabs?.refreshInternalPresentation();
      if (url) this.#host.tabs?.newTab(url, this.#pendingDisplayUrl, hostInternal);
      this.#pendingDisplayUrl = undefined;
      this.pushState();
      return this.getState();
    }
    this.#pendingUrl = url;
    this.#pendingHostInternal = hostInternal;
    this.#host.open();
    return this.getState();
  }

  public openOnboardingDemo(url: string, theme: "light" | "dark"): BrowserState {
    this.#pendingDisplayUrl = "coolto://onboarding/example-application";
    return this.open({ url, theme }, true);
  }

  public close(): void {
    this.#host.close();
  }

  public navigate(url: string): void {
    this.#host.requireTabs().activeTab()?.navigate(url);
  }

  public goBack(): void {
    this.#host.requireTabs().activeTab()?.goBack();
  }

  public goForward(): void {
    this.#host.requireTabs().activeTab()?.goForward();
  }

  public reload(): void {
    this.#host.requireTabs().activeTab()?.reload();
  }

  public stopLoading(): void {
    this.#host.tabs?.stopLoading();
  }

  public dismissDownload(id: string): void {
    this.#agentController.dismissDownload(id);
    if (this.#agentController.downloadSnapshot().length === 0) {
      this.#host.closeDownloadPopover();
    }
  }

  public toggleDownloadPopover(): void {
    if (this.#agentController.downloadSnapshot().length === 0) return;
    this.#host.toggleDownloadPopover();
  }

  public dismissPermissionNotice(): void {
    this.#permissionStatus.dismiss();
    this.pushState();
  }

  public minimize(): void {
    this.#host.minimize();
  }

  public toggleMaximize(): void {
    this.#host.toggleMaximize();
  }

  public get tabs(): BrowserTabManager | undefined {
    return this.#host.tabs;
  }

  public get shellCommands(): BrowserWindowHost { return this.#host; }

  public shellWebContents(): WebContents | undefined {
    return this.#host.shellWebContents();
  }

  public getState(): BrowserState {
    return this.#host.getState();
  }

  // ---------- 内部：活跃标签解析 + 导航联动 ----------

  #resolveActive(): ActiveTabContext {
    const ctx = activeTabContext(this.#host.tabs);
    if (!ctx) {
      throw new Error("浏览器尚未打开或无活跃标签页，请先让用户打开要操作的页面");
    }
    return ctx;
  }

  #requireControlAccess(): void {
    const check = this.#operator.checkWriteAccess();
    if (!check.ok) throw new Error(check.message);
  }

  public pushState(): void {
    if (this.#originTracker.sync(this.#host.tabs)) this.#operator.contextChanged();
    this.#emitters.emitState(this.getState());
    if (this.#host.tabs) this.#emitters.emitShellState(this.#host.shellState(
      this.#agentStatus.get(), this.#agentController.downloadSnapshot(),
      this.#permissionStatus.get(),
    ));
  }

  /**
   * B4: 用户点「中止填写」→ 转入 Overlay 让用户逐字段决定，
   * 已写入字段不能绕过审核直接生效。
   */
  public abortFill(): void {
    this.#review.abortFill();
  }

  public dispose(): void {
    this.#permissionStatus.dispose();
    this.#review.dispose();
    this.#agentController.dispose();
    this.#host.dispose();
  }

  /** chrome renderer 就绪后调用，创建首个标签页。 */
  public onShellReady(locale?: BrowserLocale): void {
    const changed = this.#presentation.setLocale(locale);
    if (changed) this.#host.tabs?.refreshInternalPresentation();
    if (this.#host.ensureFirstTab(this.#pendingUrl, this.#pendingDisplayUrl,
      this.#pendingHostInternal)) {
      this.#pendingUrl = undefined;
      this.#pendingDisplayUrl = undefined;
      this.#pendingHostInternal = false;
    }
    this.pushState();
  }
  #agentProjectionChanged(): void {
    this.#host.tabs?.refreshHomeTask();
    this.pushState();
  }
}
