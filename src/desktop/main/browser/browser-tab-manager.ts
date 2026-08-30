import type { BrowserWindow } from "electron";

import type {
  BrowserLocale,
  BrowserShellState,
  BrowserState,
} from "../../shared/types.js";
import { BrowserTab } from "./browser-tab.js";

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
  #chromeHeight = 84;

  public constructor(
    private readonly window: BrowserWindow,
    private readonly onChange: () => void,
    private readonly presentation: {
      locale: () => BrowserLocale;
      theme: () => "light" | "dark";
    },
  ) {}

  public newTab(url?: string): BrowserTab {
    const tab = new BrowserTab(
      () => this.onChange(),
      (openUrl) => {
        this.newTab(openUrl);
      },
      this.presentation,
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

  public setChromeHeight(height: number): void {
    if (height > 0 && height !== this.#chromeHeight) {
      this.#chromeHeight = Math.round(height);
      this.layout();
    }
  }

  public layout(): void {
    const size = this.window.getContentSize();
    const width = size[0] ?? 0;
    const height = size[1] ?? 0;
    const bounds = {
      x: 0,
      y: this.#chromeHeight,
      width,
      height: Math.max(0, height - this.#chromeHeight),
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
    for (const tab of this.#tabs) tab.setVisible(tab.id === this.#activeId);
    this.layout();
  }
}
