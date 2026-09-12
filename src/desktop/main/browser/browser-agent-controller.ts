import { app } from "electron";

import type {
  BrowserAgentController,
  BrowserAgentTab,
  BrowserElementQuery,
  BrowserElementQueryResult,
  BrowserObservation,
  BrowserKeypressRequest,
  BrowserWaitRequest,
  BrowserWaitResult,
} from "../../../browser/agent-control-types.js";
import type { PageSnapshot } from "../../../browser/types.js";
import type { ActiveTabContext } from "./browser-page-operator.js";
import type { BrowserTab } from "./browser-tab.js";
import type { BrowserTabManager } from "./browser-tab-manager.js";
import { normalizeAgentNavigationUrl } from "./browser-agent-navigation.js";
import { queryBrowserElements } from "./browser-agent-query.js";
import { waitForBrowserCondition } from "./browser-agent-wait.js";
import { readBrowserObservation } from "./browser-observation-reader.js";
import { BrowserDownloadTracker } from "./browser-download-tracker.js";
import { getBrowserSession } from "./browser-session.js";
import {
  dragAgentElement,
  hoverAgentElement,
  performAgentKeypress,
} from "./browser-agent-interactions.js";
import { isSubmissionTarget } from "./browser-click-guards.js";
import {
  performPageClick,
  readClickTargetHint,
} from "./browser-content-writer.js";

export interface BrowserAgentControllerDeps {
  tabs: () => BrowserTabManager | undefined;
  activeContext: () => ActiveTabContext;
  requireControlAccess: () => void;
  readPage: (context: ActiveTabContext) => Promise<PageSnapshot>;
  onDownloadsChanged?: () => void;
}

export class BrowserAgentControllerImpl implements BrowserAgentController {
  readonly #downloads: BrowserDownloadTracker;

  public constructor(private readonly deps: BrowserAgentControllerDeps) {
    this.#downloads = new BrowserDownloadTracker(
      () => getBrowserSession(),
      process.env.COOLTO_BROWSER_QA_DOWNLOAD_ROOT ?? app.getPath("downloads"),
      deps.onDownloadsChanged,
    );
  }

  public downloadSnapshot() { return this.#downloads.snapshot(); }
  public dismissDownload(id: string): boolean { return this.#downloads.dismiss(id); }

  public listTabs(): BrowserAgentTab[] {
    const tabs = this.deps.tabs();
    if (!tabs) return [];
    const activeId = tabs.activeTab()?.id;
    return tabs.allTabs().map((tab) => this.#view(tab, tab.id === activeId));
  }

  public getActiveTab(): BrowserAgentTab | null {
    const active = this.deps.tabs()?.activeTab();
    return active ? this.#view(active, true) : null;
  }

  public newTab(url?: string): BrowserAgentTab {
    this.deps.requireControlAccess();
    const target = url ? normalizeAgentNavigationUrl(url) : undefined;
    const tab = this.#tabs().newTab(target);
    return this.#view(tab, true);
  }

  public selectTab(tabId: string): BrowserAgentTab {
    this.deps.requireControlAccess();
    const tabs = this.#tabs();
    const tab = tabs.tab(tabId);
    if (!tab) throw new Error("指定的浏览器标签页不存在");
    tabs.select(tabId);
    return this.#view(tab, true);
  }

  public closeTab(tabId: string): BrowserAgentTab | null {
    this.deps.requireControlAccess();
    const tabs = this.#tabs();
    if (!tabs.tab(tabId)) throw new Error("指定的浏览器标签页不存在");
    tabs.closeTab(tabId);
    return this.getActiveTab();
  }

  public navigate(url: string): BrowserAgentTab {
    this.deps.requireControlAccess();
    const tab = this.#activeTab();
    tab.navigate(normalizeAgentNavigationUrl(url));
    return this.#view(tab, true);
  }

  public goBack(): BrowserAgentTab {
    this.deps.requireControlAccess();
    const tab = this.#activeTab();
    tab.goBack();
    return this.#view(tab, true);
  }

  public goForward(): BrowserAgentTab {
    this.deps.requireControlAccess();
    const tab = this.#activeTab();
    tab.goForward();
    return this.#view(tab, true);
  }

  public reload(): BrowserAgentTab {
    this.deps.requireControlAccess();
    const tab = this.#activeTab();
    tab.reload();
    return this.#view(tab, true);
  }

  public readActivePage(): Promise<PageSnapshot> {
    const context = this.deps.activeContext();
    return this.deps.readPage(context);
  }

  public async waitFor(
    request: BrowserWaitRequest,
    signal?: AbortSignal,
  ): Promise<BrowserWaitResult> {
    const context = this.deps.activeContext();
    if (request.kind === "download") {
      const timeoutMs = Math.min(30_000, Math.max(100, request.timeoutMs ?? 10_000));
      const download = await this.#downloads.waitFor(
        request.value?.trim() ?? "",
        timeoutMs,
        signal,
      );
      const tab = this.getActiveTab();
      if (!tab || tab.id !== context.tabId) {
        throw new Error("下载期间活跃标签页已变化，请重新观察");
      }
      return { condition: request.kind, elapsedMs: 0, tab, download };
    }
    const elapsedMs = await waitForBrowserCondition(
      context.webContents,
      request,
      signal,
    );
    const tab = this.getActiveTab();
    if (!tab || tab.id !== context.tabId) {
      throw new Error("等待期间活跃标签页已变化，请重新观察");
    }
    return { condition: request.kind, elapsedMs, tab };
  }

  public queryElements(
    query: BrowserElementQuery,
  ): Promise<BrowserElementQueryResult> {
    return queryBrowserElements(this.deps.activeContext().webContents, query);
  }

  public snapshot(includeScreenshot: boolean): Promise<BrowserObservation> {
    const context = this.deps.activeContext();
    const tab = this.getActiveTab();
    if (!tab || tab.id !== context.tabId) {
      return Promise.reject(new Error("活跃标签页已变化，请重新观察"));
    }
    return readBrowserObservation({
      contents: context.webContents,
      tab,
      page: () => this.deps.readPage(context),
      includeScreenshot,
    });
  }

  public keypress(request: BrowserKeypressRequest): Promise<void> {
    this.deps.requireControlAccess();
    return performAgentKeypress(this.deps.activeContext().webContents, request);
  }

  public hover(fillId: string): Promise<void> {
    this.deps.requireControlAccess();
    return hoverAgentElement(this.deps.activeContext().webContents, fillId);
  }

  public drag(sourceFillId: string, targetFillId: string): Promise<void> {
    this.deps.requireControlAccess();
    return dragAgentElement(
      this.deps.activeContext().webContents,
      sourceFillId,
      targetFillId,
    );
  }

  public async download(
    url: string,
    filenamePart = "",
    timeoutMs = 10_000,
    signal?: AbortSignal,
  ) {
    this.deps.requireControlAccess();
    const context = this.deps.activeContext();
    const started = Date.now();
    context.webContents.downloadURL(normalizeAgentNavigationUrl(url));
    return this.#downloads.waitFor(
      filenamePart,
      Math.min(30_000, Math.max(100, timeoutMs)),
      signal,
      started,
    );
  }

  public async submitElement(fillId: string): Promise<void> {
    this.deps.requireControlAccess();
    const contents = this.deps.activeContext().webContents;
    const hint = await readClickTargetHint(contents, fillId);
    if (!hint || !isSubmissionTarget(hint)) {
      throw new Error("browser_submit 只接受明确的 submit/send 控件");
    }
    await performPageClick(contents, fillId);
  }

  public dispose(): void {
    this.#downloads.dispose();
  }

  #tabs(): BrowserTabManager {
    const tabs = this.deps.tabs();
    if (!tabs) throw new Error("浏览器窗口尚未打开");
    return tabs;
  }

  #activeTab(): BrowserTab {
    const tab = this.#tabs().activeTab();
    if (!tab) throw new Error("浏览器没有活跃标签页");
    return tab;
  }

  #view(tab: BrowserTab, active: boolean): BrowserAgentTab {
    const state = tab.getState();
    return { ...state, isActive: active };
  }
}
