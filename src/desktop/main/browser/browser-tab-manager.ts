import type { BrowserWindow } from "electron";

import type {
  BrowserLocale,
  BrowserShellState,
  BrowserState,
} from "../../shared/types.js";
import { browserChromeHeightDip } from
  "../../../browser/browser-agent-inspector-layout.js";
import { BrowserTab } from "./browser-tab.js";
import type { BrowserShortcutRouter } from "./browser-shortcut-router.js";
import type { BrowserHomeTaskSnapshot } from "./browser-home-page.js";

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

/**
 * B1: 管理浏览器窗口内的多个标签页（WebContentsView）。
 * 负责新建/关闭/切换标签、维护激活标签、按 chrome 高度布局内容视图，
 * 并派生主窗口 BrowserState 与 chrome 用的 BrowserShellState。
 */
export class BrowserTabManager {
  readonly #tabs: BrowserTab[] = [];
  #activeId: string | null = null;
  #chromeHeightCss = 84;
  #rightInset = 0;

  public constructor(
    private readonly window: BrowserWindow,
    private readonly onChange: () => void,
    private readonly presentation: {
      locale: () => BrowserLocale;
      theme: () => "light" | "dark";
      homeTask: () => BrowserHomeTaskSnapshot | null;
    },
    private readonly shortcutRouter: BrowserShortcutRouter,
    private readonly shouldFocusPage: () => boolean = () => true,
    private readonly openTask: () => void = () => undefined,
  ) {}

  public newTab(url?: string, displayUrl?: string): BrowserTab {
    const tab = new BrowserTab(
      () => this.onChange(),
      (openUrl) => {
        this.newTab(openUrl);
      },
      this.presentation,
      this.shortcutRouter,
      () => this.window.isDestroyed() ? undefined : this.window,
      this.openTask,
      displayUrl,
    );
    this.#tabs.push(tab);
    this.window.contentView.addChildView(tab.view);
    tab.loadUrl(url);
    this.select(tab.id);
    return tab;
  }

  public closeTab(tabId: string): void {
    const index = this.#tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    const [removed] = this.#tabs.splice(index, 1);
    if (removed) {
      this.window.contentView.removeChildView(removed.view);
      removed.destroy();
    }
    if (this.#activeId === tabId) {
      const next = this.#tabs[index] ?? this.#tabs[index - 1];
      this.#activeId = next?.id ?? null;
    }
    if (this.#tabs.length === 0) {
      this.window.close();
      return;
    }
    this.#applyVisibility();
    this.onChange();
  }

  public select(tabId: string): void {
    if (!this.#tabs.some((tab) => tab.id === tabId)) return;
    this.#activeId = tabId;
    this.#applyVisibility();
    this.onChange();
  }

  public closeActive(): boolean {
    if (!this.#activeId) return false;
    this.closeTab(this.#activeId);
    return true;
  }

  public cycle(direction: "next" | "previous"): boolean {
    if (this.#tabs.length === 0) return false;
    const current = Math.max(0, this.#tabs.findIndex((tab) => tab.id === this.#activeId));
    const delta = direction === "next" ? 1 : -1;
    const index = (current + delta + this.#tabs.length) % this.#tabs.length;
    this.select(this.#tabs[index]!.id);
    return true;
  }

  public selectIndex(index: number): boolean {
    const tab = this.#tabs[index];
    if (!tab) return false;
    this.select(tab.id);
    return true;
  }

  public selectLast(): boolean {
    const tab = this.#tabs.at(-1);
    if (!tab) return false;
    this.select(tab.id);
    return true;
  }

  public setChromeHeight(height: number): void {
    if (height <= 0) return;
    this.#chromeHeightCss = Math.round(height);
    this.layout();
  }

  public get chromeHeightDip(): number {
    return browserChromeHeightDip(
      this.#chromeHeightCss, this.window.webContents.getZoomFactor(),
    );
  }

  public setRightInset(width: number): void {
    const next = Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0;
    if (next === this.#rightInset) return;
    this.#rightInset = next;
    this.layout();
  }

  public layout(): void {
    const size = this.window.getContentSize();
    const width = size[0] ?? 0;
    const height = size[1] ?? 0;
    const bounds = {
      x: 0,
      y: this.chromeHeightDip,
      width: Math.max(0, width - this.#rightInset),
      height: Math.max(0, height - this.chromeHeightDip),
    };
    for (const tab of this.#tabs) tab.setBounds(bounds);
  }

  public activeTab(): BrowserTab | undefined {
    return this.#tabs.find((tab) => tab.id === this.#activeId);
  }

  public stopLoading(): void {
    this.activeTab()?.stop();
  }

  public refreshInternalPresentation(): void {
    for (const tab of this.#tabs) tab.refreshInternalPresentation();
  }

  public refreshHomeTask(): void {
    for (const tab of this.#tabs) tab.refreshHomeTask();
  }

  public tab(tabId: string): BrowserTab | undefined {
    return this.#tabs.find((tab) => tab.id === tabId);
  }

  public allTabs(): readonly BrowserTab[] {
    return this.#tabs;
  }

  public hasTabs(): boolean {
    return this.#tabs.length > 0;
  }

  public shellState(): Pick<BrowserShellState, "tabs" | "activeTabId"> {
    return {
      tabs: this.#tabs.map((tab) => tab.getState()),
      activeTabId: this.#activeId,
    };
  }

  public browserState(): BrowserState {
    const active = this.activeTab();
    if (!active) return { ...IDLE_STATE, isOpen: true };
    const state = active.getState();
    return {
      ...IDLE_STATE,
      isOpen: true,
      currentUrl: state.url,
      pageTitle: state.title,
      isLoading: state.isLoading,
      canGoBack: state.canGoBack,
      canGoForward: state.canGoForward,
    };
  }

  public destroyAll(): void {
    const alive = !this.window.isDestroyed();
    for (const tab of this.#tabs) {
      if (alive) this.window.contentView.removeChildView(tab.view);
      tab.destroy();
    }
    this.#tabs.length = 0;
    this.#activeId = null;
  }

  #applyVisibility(): void {
    for (const tab of this.#tabs) tab.setActive(tab.id === this.#activeId);
    this.layout();
    if (this.shouldFocusPage()) this.activeTab()?.focus();
  }
}
