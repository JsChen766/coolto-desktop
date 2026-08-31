import { type BrowserWindow, type WebContents } from "electron";

import type { BrowserShellState, BrowserState } from "../../shared/types.js";
import { createBrowserWindow, deriveShellState } from "./browser-window-factory.js";
import { BROWSER_SHELL_CHANNELS } from "./browser-ipc-channels.js";
import { BrowserShortcutRouter } from "./browser-shortcut-router.js";
import { BrowserAgentInspectorHost } from "./browser-agent-inspector-host.js";
import type { BrowserTab } from "./browser-tab.js";
import type { BrowserTabManager } from "./browser-tab-manager.js";
import type { BrowserWindowPresentation } from "./browser-window-presentation.js";
import { BrowserWindowTabCommands } from "./browser-window-tab-commands.js";
import { IDLE_BROWSER_STATE } from "./browser-window-state.js";
import type { BrowserHomeTaskSnapshot } from "./browser-home-page.js";
import { BrowserDownloadPopoverHost } from "./browser-download-popover-host.js";

export class BrowserWindowHost {
  readonly #shortcutRouter: BrowserShortcutRouter;
  readonly #tabCommands: BrowserWindowTabCommands;
  #detachShellShortcut: (() => void) | undefined;
  #downloads: BrowserDownloadPopoverHost | undefined;
  #inspector: BrowserAgentInspectorHost | undefined;
  #tabs: BrowserTabManager | undefined;
  #window: BrowserWindow | undefined;

  public constructor(
    private readonly presentation: BrowserWindowPresentation,
    private readonly onLayoutChange: () => void,
    private readonly onClosed: () => void,
    private readonly homeTask: () => BrowserHomeTaskSnapshot | null,
    private readonly openTask: () => void,
  ) {
    this.#tabCommands = new BrowserWindowTabCommands(
      () => this.#tabs,
      (channel) => this.#focusShell(channel),
    );
    this.#shortcutRouter = new BrowserShortcutRouter({
      getContext: () => {
        const state = this.#tabs?.activeTab()?.getState();
        return {
          downloadOpen: this.#downloads?.isOpen ?? false,
          findOpen: state?.find.open ?? false,
          inspectorOpen: this.#inspector?.isOpen ?? false,
          isLoading: state?.isLoading ?? false,
        };
      },
      focusAddress: () => this.#focusShell(BROWSER_SHELL_CHANNELS.focusAddress),
      newTab: () => this.#tabCommands.newTab(),
      closeTab: () => this.#tabs?.closeActive() ?? false,
      cycleTab: (direction) => this.#tabs?.cycle(direction) ?? false,
      selectTab: (index) => this.#tabs?.selectIndex(index) ?? false,
      selectLastTab: () => this.#tabs?.selectLast() ?? false,
      reload: () => this.#withActive((tab) => tab.reload()),
      stopLoading: () => this.#withActive((tab) => tab.stop()),
      goBack: () => this.#withActive((tab) => tab.goBack()),
      goForward: () => this.#withActive((tab) => tab.goForward()),
      openFind: () => this.#tabCommands.openFind(),
      closeFind: () => this.#tabCommands.closeFind(),
      closeDownloads: () => this.closeDownloadPopover(),
      closeInspector: () => this.closeAgentInspector(),
      findNext: (direction) => this.#tabCommands.findNext(direction),
      zoom: (action) => this.#withActive((tab) => tab.zoom(action)),
    });
  }

  public get tabs(): BrowserTabManager | undefined { return this.#tabs; }
  public get window(): BrowserWindow | undefined {
    return this.#window && !this.#window.isDestroyed() ? this.#window : undefined;
  }
  public get isOpen(): boolean { return Boolean(this.window); }
  public get isMaximized(): boolean { return this.window?.isMaximized() ?? false; }
  public get isAgentInspectorOpen(): boolean { return this.#inspector?.isOpen ?? false; }
  public get isDownloadPopoverOpen(): boolean { return this.#downloads?.isOpen ?? false; }

  public open(): void {
    const window = createBrowserWindow({
      theme: () => this.presentation.theme,
      locale: () => this.presentation.locale,
      homeTask: this.homeTask,
      openTask: this.openTask,
      shortcutRouter: this.#shortcutRouter,
      shouldFocusPage: () => !this.#inspector?.webContents?.isFocused() &&
        !this.#downloads?.webContents?.isFocused(),
      onCreated: (tabs, createdWindow) => {
        this.#tabs = tabs;
        this.#downloads = new BrowserDownloadPopoverHost(createdWindow,
          () => tabs.chromeHeightDip, () => queueMicrotask(this.onLayoutChange),
          () => this.#focusShell(BROWSER_SHELL_CHANNELS.focusDownloads),
          this.#shortcutRouter);
      },
      onLayoutChange: this.onLayoutChange,
      onClosed: (window) => {
        if (this.#window !== window) return;
        this.#clearShellShortcut();
        this.#downloads?.dispose();
        this.#downloads = undefined;
        this.#inspector?.dispose();
        this.#inspector = undefined;
        this.#tabs?.destroyAll();
        this.#tabs = undefined;
        this.#window = undefined;
        this.onClosed();
      },
    });
    this.#window = window;
    this.#detachShellShortcut = this.#shortcutRouter.attach(window.webContents);
    const tabs = this.#tabs;
    if (tabs) {
      this.#inspector = new BrowserAgentInspectorHost(
        window, () => tabs.chromeHeightDip, (width) => tabs.setRightInset(width),
        () => queueMicrotask(this.onLayoutChange),
        () => {
          const active = tabs.activeTab();
          if (active) active.focus();
          else window.webContents.focus();
        },
        this.#shortcutRouter,
      );
      window.on("resize", () => { this.#inspector?.layout(); this.#downloads?.layout(); });
    }
  }

  public focus(): void { this.window?.focus(); }
  public close(): void { this.window?.close(); }
  public minimize(): void { this.window?.minimize(); }
  public toggleMaximize(): void {
    const window = this.window;
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  }
  public shellWebContents(): WebContents | undefined { return this.window?.webContents; }
  public inspectorWebContents(): WebContents | undefined {
    return this.#inspector?.webContents;
  }
  public downloadPopoverWebContents(): WebContents | undefined {
    return this.#downloads?.webContents;
  }

  public newTab(): boolean { return this.#tabCommands.newTab(); }
  public searchFind(query: string): boolean { return this.#tabCommands.searchFind(query); }
  public findNext(direction: "next" | "previous"): boolean {
    return this.#tabCommands.findNext(direction);
  }
  public closeFind(): boolean { return this.#tabCommands.closeFind(); }
  public resetZoom(): boolean { return this.#tabCommands.resetZoom(); }

  public toggleDownloadPopover(): void { this.#downloads?.toggle(); }
  public closeDownloadPopover(): boolean {
    return this.#downloads?.close() ?? false;
  }
  public onDownloadPopoverReady(): void { this.#downloads?.onReady(); }

  public toggleAgentInspector(): void {
    this.#inspector?.toggle();
  }

  public closeAgentInspector(): boolean {
    if (!this.#inspector?.isOpen) return false;
    this.#inspector.close(false);
    const contents = this.shellWebContents();
    contents?.focus();
    contents?.send(BROWSER_SHELL_CHANNELS.focusAgentCapsule);
    return true;
  }

  public closeAgentInspectorToPage(): boolean {
    if (!this.#inspector?.isOpen) return false;
    this.#inspector.close();
    return true;
  }
  public onAgentInspectorReady(reducedMotion = false): void {
    this.#inspector?.onReady(reducedMotion);
  }

  public setChromeHeight(height: number): void {
    this.#tabs?.setChromeHeight(height);
    this.#inspector?.layout();
    this.#downloads?.layout();
  }

  public getState(): BrowserState {
    return this.isOpen && this.#tabs
      ? this.#tabs.browserState()
      : { ...IDLE_BROWSER_STATE };
  }

  public shellState(
    agentControl: BrowserShellState["agentControl"],
    downloads: BrowserShellState["downloads"],
    permissionNotice: BrowserShellState["permissionNotice"],
  ): BrowserShellState {
    this.#inspector?.update(
      agentControl, this.presentation.theme, this.presentation.locale,
    );
    this.#inspector?.layout();
    this.#downloads?.update(downloads, this.presentation.theme, this.presentation.locale);
    this.#downloads?.layout();
    return deriveShellState(
      this.#tabs, this.presentation.theme, this.isMaximized,
      agentControl, downloads, permissionNotice, this.#inspector?.isOpen ?? false,
      this.presentation.locale, this.#downloads?.isOpen ?? false,
    );
  }

  public requireTabs(): BrowserTabManager {
    if (!this.#tabs) throw new Error("浏览器窗口尚未打开");
    return this.#tabs;
  }

  public ensureFirstTab(url?: string, displayUrl?: string): boolean {
    if (!this.#tabs || this.#tabs.hasTabs()) return false;
    this.#tabs.newTab(url, displayUrl);
    if (!url) this.#focusShell(BROWSER_SHELL_CHANNELS.focusAddress);
    return true;
  }

  public dispose(): void {
    this.#clearShellShortcut();
    this.#downloads?.dispose();
    this.#downloads = undefined;
    this.#inspector?.dispose();
    this.#inspector = undefined;
    this.#tabs?.destroyAll();
    this.#tabs = undefined;
    this.window?.destroy();
    this.#window = undefined;
  }

  #focusShell(channel: string): boolean {
    const window = this.window;
    const contents = window?.webContents;
    if (!window || !contents || contents.isDestroyed()) return false;
    window.focus();
    contents.focus();
    contents.send(channel);
    return true;
  }

  #withActive(action: (tab: BrowserTab) => void): boolean {
    const tab = this.#tabs?.activeTab();
    if (!tab) return false;
    action(tab);
    return true;
  }

  #clearShellShortcut(): void {
    this.#detachShellShortcut?.();
    this.#detachShellShortcut = undefined;
  }
}
