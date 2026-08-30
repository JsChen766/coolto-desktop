import { type BrowserWindow, type WebContents } from "electron";

import type {
  BrowserShellState,
  BrowserState,
} from "../../shared/types.js";
import {
  createBrowserWindow,
  deriveShellState,
} from "./browser-window-factory.js";
import type { BrowserTabManager } from "./browser-tab-manager.js";
import type { BrowserWindowPresentation } from "./browser-window-presentation.js";
import { IDLE_BROWSER_STATE } from "./browser-window-state.js";

export class BrowserWindowHost {
  #tabs: BrowserTabManager | undefined;
  #window: BrowserWindow | undefined;

  public constructor(
    private readonly presentation: BrowserWindowPresentation,
    private readonly onLayoutChange: () => void,
    private readonly onClosed: () => void,
  ) {}

  public get tabs(): BrowserTabManager | undefined { return this.#tabs; }
  public get window(): BrowserWindow | undefined {
    return this.#window && !this.#window.isDestroyed() ? this.#window : undefined;
  }
  public get isOpen(): boolean { return Boolean(this.window); }
  public get isMaximized(): boolean { return this.window?.isMaximized() ?? false; }

  public open(): void {
    this.#window = createBrowserWindow({
      theme: () => this.presentation.theme,
      locale: () => this.presentation.locale,
      onCreated: (tabs) => { this.#tabs = tabs; },
      onLayoutChange: this.onLayoutChange,
      onClosed: (window) => {
        if (this.#window !== window) return;
        this.#tabs = undefined;
        this.#window = undefined;
        this.onClosed();
      },
    });
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

  public getState(): BrowserState {
    return this.isOpen && this.#tabs
      ? this.#tabs.browserState()
      : { ...IDLE_BROWSER_STATE };
  }

  public shellState(
    agentControl: BrowserShellState["agentControl"],
    permissionNotice: BrowserShellState["permissionNotice"],
  ): BrowserShellState {
    return deriveShellState(
      this.#tabs, this.presentation.theme, this.isMaximized,
      agentControl, permissionNotice,
    );
  }

  public requireTabs(): BrowserTabManager {
    if (!this.#tabs) throw new Error("浏览器窗口尚未打开");
    return this.#tabs;
  }

  public ensureFirstTab(url?: string): boolean {
    if (!this.#tabs || this.#tabs.hasTabs()) return false;
    this.#tabs.newTab(url);
    return true;
  }

  public dispose(): void {
    this.#tabs?.destroyAll();
    this.#tabs = undefined;
    this.window?.destroy();
    this.#window = undefined;
  }
}
