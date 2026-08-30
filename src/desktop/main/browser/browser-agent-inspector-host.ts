import { join } from "node:path";

import { app, type BrowserWindow, type WebContents, WebContentsView } from "electron";

import { resolveBrowserAgentInspectorLayout } from
  "../../../browser/browser-agent-inspector-layout.js";
import type {
  BrowserAgentChromeView,
  BrowserAgentInspectorViewState,
} from "../../shared/types.js";
import { BROWSER_AGENT_INSPECTOR_CHANNELS as C } from "./browser-ipc-channels.js";
import type { BrowserShortcutRouter } from "./browser-shortcut-router.js";

export class BrowserAgentInspectorHost {
  #agent: BrowserAgentChromeView | null = null;
  #closeTimer: ReturnType<typeof setTimeout> | undefined;
  #closing = false;
  #detachShortcut: (() => void) | undefined;
  #locale: "zh-CN" | "en-US" = "zh-CN";
  #mode: "docked" | "overlay" = "docked";
  #open = false;
  #ready = false;
  #reducedMotion = false;
  #theme: "light" | "dark" = "light";
  #view: WebContentsView | undefined;
  #restoreFocusAfterClose = false;

  public constructor(
    private readonly window: BrowserWindow,
    private readonly chromeHeight: () => number,
    private readonly setPageRightInset: (width: number) => void,
    private readonly openChanged: () => void,
    private readonly restorePageFocus: () => void,
    private readonly shortcutRouter: BrowserShortcutRouter,
  ) {}

  public get isOpen(): boolean { return this.#open && !this.#closing; }
  public get webContents(): WebContents | undefined {
    const contents = this.#view?.webContents;
    return contents && !contents.isDestroyed() ? contents : undefined;
  }

  public update(
    agent: BrowserAgentChromeView | null,
    theme: "light" | "dark",
    locale: "zh-CN" | "en-US",
  ): void {
    this.#locale = locale;
    this.#theme = theme;
    if (!agent) {
      this.close();
      this.#agent = null;
      return;
    }
    this.#agent = structuredClone(agent);
    if (this.#open) this.#sendState();
  }

  public toggle(): void {
    if (this.#closing) {
      this.open();
      return;
    }
    if (this.#open) this.close();
    else this.open();
  }

  public open(): void {
    if (this.#closing && this.#agent && !this.window.isDestroyed()) {
      this.#clearCloseTimer();
      this.#closing = false;
      this.#restoreFocusAfterClose = false;
      this.#sendState();
      this.focus();
      this.openChanged();
      return;
    }
    if (this.#open || !this.#agent || this.window.isDestroyed()) return;
    this.#ensureView();
    this.#closing = false;
    this.#open = true;
    this.#view!.setVisible(true);
    this.layout();
    if (!this.#open) return;
    this.#sendState();
    this.focus();
    this.openChanged();
  }

  public close(restoreFocus = true): void {
    if (!this.#open || this.#closing) return;
    this.#restoreFocusAfterClose = restoreFocus;
    if (this.#reducedMotion) {
      this.#finishClose();
      return;
    }
    this.#closing = true;
    this.#sendState();
    this.openChanged();
    this.#closeTimer = setTimeout(() => this.#finishClose(), 160);
  }

  public onReady(reducedMotion = false): void {
    this.#reducedMotion = reducedMotion;
    this.#ready = true;
    this.#sendState();
    if (this.#open) this.focus();
  }

  public focus(): void {
    const contents = this.webContents;
    if (!this.#open || !contents) return;
    contents.focus();
    contents.send(C.focus);
  }

  public layout(): void {
    if (!this.#open || !this.#view || this.window.isDestroyed()) return;
    const [windowWidthDip = 0, windowHeightDip = 0] = this.window.getContentSize();
    const shellZoomFactor = this.window.webContents.getZoomFactor();
    if (this.webContents?.getZoomFactor() !== shellZoomFactor) {
      this.webContents?.setZoomFactor(shellZoomFactor);
    }
    const layout = resolveBrowserAgentInspectorLayout({
      windowWidthDip,
      windowHeightDip,
      shellZoomFactor,
      chromeHeight: this.chromeHeight(),
      open: true,
    });
    if (!layout.panelBounds) {
      this.close();
      return;
    }
    this.#mode = layout.mode === "overlay" ? "overlay" : "docked";
    this.#view.setBounds(layout.panelBounds);
    this.setPageRightInset(layout.pageRightInset);
    this.window.contentView.addChildView(this.#view);
    this.#sendState();
  }

  public dispose(): void {
    this.#clearCloseTimer();
    this.setPageRightInset(0);
    this.#detachShortcut?.();
    this.#detachShortcut = undefined;
    const view = this.#view;
    this.#view = undefined;
    if (!view) return;
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  #ensureView(): void {
    if (this.#view) return;
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/browser-agent-inspector.cjs"),
        partition: "browser-agent-inspector", contextIsolation: true,
        devTools: !app.isPackaged, nodeIntegration: false, sandbox: true,
      },
    });
    view.setBackgroundColor("#00000000");
    this.#view = view;
    view.setVisible(false);
    const contents = view.webContents;
    this.#detachShortcut = this.shortcutRouter.attach(contents);
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-redirect", (event) => event.preventDefault());
    contents.on("render-process-gone", () => {
      if (!contents.isDestroyed()) contents.close();
    });
    contents.once("destroyed", () => this.#viewDestroyed(view));
    void loadInspector(contents).catch(() => {
      if (!contents.isDestroyed()) contents.close();
    });
  }

  #viewDestroyed(view: WebContentsView): void {
    if (this.#view !== view) return;
    this.#detachShortcut?.();
    this.#detachShortcut = undefined;
    const wasOpen = this.#open;
    this.#view = undefined;
    this.#ready = false;
    this.#open = false;
    this.#closing = false;
    this.#clearCloseTimer();
    this.setPageRightInset(0);
    if (wasOpen) {
      this.restorePageFocus();
      this.openChanged();
    }
  }

  #sendState(): void {
    const contents = this.webContents;
    if (!this.#ready || !this.#open || !this.#agent || !contents) return;
    const state: BrowserAgentInspectorViewState = {
      agent: structuredClone(this.#agent), locale: this.#locale,
      mode: this.#mode, presentation: this.#closing ? "closing" : "open",
      theme: this.#theme,
    };
    contents.send(C.stateChanged, state);
  }

  #finishClose(): void {
    if (!this.#open) return;
    this.#clearCloseTimer();
    this.#open = false;
    this.#closing = false;
    this.#view?.setVisible(false);
    this.setPageRightInset(0);
    if (this.#restoreFocusAfterClose) this.restorePageFocus();
    this.#restoreFocusAfterClose = false;
    this.openChanged();
  }

  #clearCloseTimer(): void {
    if (this.#closeTimer) clearTimeout(this.#closeTimer);
    this.#closeTimer = undefined;
  }
}

function loadInspector(contents: WebContents): Promise<void> {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    return contents.loadURL(`${process.env.ELECTRON_RENDERER_URL}/browser-agent-inspector.html`);
  }
  return contents.loadFile(join(__dirname, "../renderer/browser-agent-inspector.html"));
}
