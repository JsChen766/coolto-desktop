import { join } from "node:path";

import { app, type BrowserWindow, type WebContents, WebContentsView } from "electron";

import type {
  BrowserDownloadPopoverViewState,
  BrowserDownloadView,
  BrowserLocale,
} from "../../shared/types.js";
import { BROWSER_DOWNLOAD_POPOVER_CHANNELS as C } from "./browser-ipc-channels.js";
import type { BrowserShortcutRouter } from "./browser-shortcut-router.js";

export class BrowserDownloadPopoverHost {
  readonly #detachShortcut: Array<() => void> = [];
  #downloads: BrowserDownloadView[] = [];
  #locale: BrowserLocale = "zh-CN";
  #open = false;
  #ready = false;
  #theme: "light" | "dark" = "light";
  #view: WebContentsView | undefined;

  public constructor(
    private readonly window: BrowserWindow,
    private readonly chromeHeight: () => number,
    private readonly openChanged: () => void,
    private readonly restoreTriggerFocus: () => void,
    private readonly shortcutRouter: BrowserShortcutRouter,
  ) {}

  public get isOpen(): boolean { return this.#open; }
  public get webContents(): WebContents | undefined {
    const contents = this.#view?.webContents;
    return contents && !contents.isDestroyed() ? contents : undefined;
  }

  public update(
    downloads: BrowserDownloadView[],
    theme: "light" | "dark",
    locale: BrowserLocale,
  ): void {
    this.#downloads = downloads.map((download) => ({ ...download }));
    this.#theme = theme;
    this.#locale = locale;
    if (downloads.length === 0) this.close();
    else if (this.#open) {
      this.layout();
      this.#sendState();
    }
  }

  public toggle(): void { this.#open ? this.close() : this.open(); }

  public open(): void {
    if (this.#open || this.#downloads.length === 0 || this.window.isDestroyed()) return;
    this.#ensureView();
    this.#open = true;
    this.#view!.setVisible(true);
    this.layout();
    this.#sendState();
    this.focus();
    this.openChanged();
  }

  public close(restoreFocus = true): void {
    if (!this.#open) return;
    const wasFocused = this.webContents?.isFocused() ?? false;
    this.#open = false;
    this.#view?.setVisible(false);
    if (restoreFocus && wasFocused) this.restoreTriggerFocus();
    this.openChanged();
  }

  public onReady(): void {
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
    const [windowWidth = 0, windowHeight = 0] = this.window.getContentSize();
    const zoom = this.window.webContents.getZoomFactor();
    if (this.webContents?.getZoomFactor() !== zoom) this.webContents?.setZoomFactor(zoom);
    const top = this.chromeHeight() + 6;
    const width = Math.min(340, Math.max(260, windowWidth - 20));
    const desiredHeight = Math.min(
      440, Math.round((98 + Math.min(5, this.#downloads.length) * 74) * zoom),
    );
    const height = Math.min(desiredHeight, Math.max(160, windowHeight - top - 10));
    this.#view.setBounds({ x: windowWidth - width - 10, y: top, width, height });
    this.window.contentView.addChildView(this.#view);
  }

  public dispose(): void {
    for (const detach of this.#detachShortcut.splice(0)) detach();
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
        preload: join(__dirname, "../preload/browser-download-popover.cjs"),
        partition: "browser-download-popover", contextIsolation: true,
        devTools: !app.isPackaged, nodeIntegration: false, sandbox: true,
      },
    });
    this.#view = view;
    view.setVisible(false);
    const contents = view.webContents;
    this.#detachShortcut.push(this.shortcutRouter.attach(contents));
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-redirect", (event) => event.preventDefault());
    contents.once("destroyed", () => this.#viewDestroyed(view));
    void loadPopover(contents).catch(() => {
      if (!contents.isDestroyed()) contents.close();
    });
  }

  #viewDestroyed(view: WebContentsView): void {
    if (this.#view !== view) return;
    for (const detach of this.#detachShortcut.splice(0)) detach();
    this.#view = undefined;
    this.#ready = false;
    const wasOpen = this.#open;
    this.#open = false;
    if (wasOpen) {
      this.restoreTriggerFocus();
      this.openChanged();
    }
  }

  #sendState(): void {
    const contents = this.webContents;
    if (!this.#ready || !this.#open || !contents) return;
    const state: BrowserDownloadPopoverViewState = {
      downloads: this.#downloads.map((download) => ({ ...download })),
      locale: this.#locale,
      theme: this.#theme,
    };
    contents.send(C.stateChanged, state);
  }
}

function loadPopover(contents: WebContents): Promise<void> {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    return contents.loadURL(`${process.env.ELECTRON_RENDERER_URL}/browser-download-popover.html`);
  }
  return contents.loadFile(join(__dirname, "../renderer/browser-download-popover.html"));
}
