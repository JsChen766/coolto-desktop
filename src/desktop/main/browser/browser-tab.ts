import { randomUUID } from "node:crypto";

import { app, WebContentsView, type BrowserWindow, type Rectangle } from "electron";

import { browserNavigationFailureRecord } from "../../../browser/browser-tab-presentation.js";
import { BrowserTabFaviconState } from "../../../browser/browser-tab-favicon.js";
import { normalizeBrowserNavigationUrl } from "../../../browser/browser-navigation-url.js";
import type {
  BrowserLocale,
  BrowserLoadPhase,
  BrowserTabState,
} from "../../shared/types.js";
import {
  browserErrorTitle,
  browserErrorUrl,
  isBrowserErrorUrl,
  isBrowserInternalUrl,
} from "./browser-error-page.js";
import {
  browserHomeUrl,
  browserHomeTaskKey,
  isBrowserHomeActionUrl,
  isBrowserHomeUrl,
  type BrowserHomeTaskSnapshot,
} from "./browser-home-page.js";
import { getBrowserSession } from "./browser-session.js";
import type { BrowserShortcutRouter } from "./browser-shortcut-router.js";
import { BrowserTabControls } from "./browser-tab-controls.js";
import type { BrowserZoomAction } from "./browser-tab-zoom.js";
import { buildBrowserUserAgent } from "./browser-user-agent.js";

export interface BrowserTabPresentationContext {
  locale: () => BrowserLocale;
  theme: () => "light" | "dark";
  homeTask: () => BrowserHomeTaskSnapshot | null;
}

export class BrowserTab {
  readonly id = randomUUID();
  readonly view: WebContentsView;
  readonly #internalToken = randomUUID();
  #failure: BrowserTabState["failure"] = null;
  #failedNavigationUrl: string | null = null;
  readonly #favicon = new BrowserTabFaviconState();
  #loadPhase: BrowserLoadPhase = "idle";
  #homeTaskKey = "";
  #showingErrorPage = false;
  readonly #controls: BrowserTabControls;

  public constructor(
    private readonly onChange: () => void,
    onOpenUrl: (url: string) => void,
    private readonly presentation: BrowserTabPresentationContext,
    shortcutRouter: BrowserShortcutRouter,
    window: () => BrowserWindow | undefined,
    onOpenTask: () => void,
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        session: getBrowserSession(), contextIsolation: true,
        devTools: !app.isPackaged, nodeIntegration: false, sandbox: true,
      },
    });
    const contents = this.view.webContents;
    this.#controls = new BrowserTabControls({
      contents,
      internalToken: this.#internalToken,
      locale: presentation.locale,
      onChange,
      openUrl: onOpenUrl,
      shortcutRouter,
      window,
    });
    contents.setUserAgent(buildBrowserUserAgent({
      chromeVersion: process.versions.chrome, platform: process.platform,
    }));
    contents.on("will-navigate", (event, url) => {
      if (!isBrowserHomeUrl(contents.getURL(), this.#internalToken) ||
          !isBrowserHomeActionUrl(url, this.#internalToken)) return;
      event.preventDefault();
      onOpenTask();
    });
    contents.on("did-start-navigation", (details) => {
      if (!details.isMainFrame || details.isSameDocument) return;
      if (this.#showingErrorPage && isBrowserErrorUrl(details.url, this.#internalToken)) return;
      this.#showingErrorPage = false;
      this.#failure = null;
      this.#failedNavigationUrl = null;
      this.#favicon.startNavigation(contents.getURL(), details.url);
      this.#controls.resetOnNavigation();
      this.#setPhase("starting");
    });
    contents.on("did-start-loading", () => {
      if (!this.#showingErrorPage) this.#setPhase("starting");
    });
    contents.on("did-navigate", (_event, url) => {
      this.#controls.onNavigation();
      if (!isBrowserErrorUrl(url, this.#internalToken)) this.#setPhase("committed");
      else this.onChange();
    });
    contents.on("did-navigate-in-page", this.onChange);
    contents.on("dom-ready", () => {
      if (!this.#showingErrorPage) this.#setPhase("dom-ready");
    });
    contents.on("did-finish-load", () => {
      if (!this.#showingErrorPage) this.#setPhase("complete");
    });
    contents.on("did-stop-loading", () => {
      if (!this.#showingErrorPage) this.#setPhase("complete");
    });
    contents.on("page-title-updated", this.onChange);
    contents.on("page-favicon-updated", (_event, favicons) => {
      this.#favicon.update(contents.getURL(), favicons);
      this.onChange();
    });
    contents.on("did-fail-load", (
      _event, code, description, url, isMainFrame,
    ) => {
      if (!isMainFrame || code === -3 || isBrowserInternalUrl(url, this.#internalToken)) return;
      const failure = browserNavigationFailureRecord(code, description, url);
      this.#failure = failure.failure;
      this.#failedNavigationUrl = failure.retryUrl;
      this.#favicon.clearForFailure();
      this.#loadPhase = "failed";
      this.#showingErrorPage = true;
      this.onChange();
      void contents.loadURL(browserErrorUrl({
        failure: this.#failure,
        internalToken: this.#internalToken,
        locale: this.presentation.locale(),
        retryUrl: this.#failedNavigationUrl ?? this.#failure.url,
        theme: this.presentation.theme(),
      }));
    });
  }

  public loadUrl(url?: string): void {
    const target = url?.trim();
    this.#navigate(target ? normalizeBrowserNavigationUrl(target) ?? this.#homeUrl()
      : this.#homeUrl());
  }
  public navigate(url: string): void {
    const target = normalizeBrowserNavigationUrl(url);
    if (target) this.#navigate(target);
  }
  public stop(): void {
    this.view.webContents.stop();
    if (!this.#failure) this.#setPhase("complete");
  }
  public refreshInternalPresentation(): void {
    const url = this.view.webContents.getURL();
    if (isBrowserHomeUrl(url, this.#internalToken)) {
      this.#navigate(this.#homeUrl());
    } else if (isBrowserErrorUrl(url, this.#internalToken) && this.#failure) {
      this.#showingErrorPage = true;
      void this.view.webContents.loadURL(browserErrorUrl({
        failure: this.#failure,
        internalToken: this.#internalToken,
        locale: this.presentation.locale(),
        retryUrl: this.#failedNavigationUrl ?? this.#failure.url,
        theme: this.presentation.theme(),
      }));
    }
  }
  public refreshHomeTask(): void {
    const url = this.view.webContents.getURL();
    if (!isBrowserHomeUrl(url, this.#internalToken)) return;
    const nextKey = browserHomeTaskKey(this.presentation.homeTask());
    if (nextKey !== this.#homeTaskKey) this.#navigate(this.#homeUrl());
  }
  public setBounds(bounds: Rectangle): void { this.view.setBounds(bounds); }
  public setActive(active: boolean): void {
    this.view.setVisible(active);
    this.#controls.setActive(active);
  }
  public focus(): void { this.view.webContents.focus(); }
  public goBack(): void {
    const history = this.view.webContents.navigationHistory;
    if (history.canGoBack()) history.goBack();
  }
  public goForward(): void {
    const history = this.view.webContents.navigationHistory;
    if (history.canGoForward()) history.goForward();
  }
  public reload(): void {
    const retryUrl = this.#showingErrorPage
      ? this.#failedNavigationUrl
      : null;
    if (retryUrl) this.#navigate(retryUrl);
    else this.view.webContents.reload();
  }
  public getState(): BrowserTabState {
    const contents = this.view.webContents;
    const rawUrl = contents.getURL();
    const home = isBrowserHomeUrl(rawUrl, this.#internalToken);
    const failed = isBrowserErrorUrl(rawUrl, this.#internalToken) && this.#failure;
    return {
      id: this.id,
      title: home ? this.presentation.locale() === "en-US" ? "New tab" : "新标签页"
        : failed ? browserErrorTitle(this.presentation.locale())
          : contents.getTitle() || (this.presentation.locale() === "en-US" ? "Loading…" : "加载中…"),
      url: home ? null : failed ? this.#failure!.url : rawUrl || null,
      isLoading: !this.#showingErrorPage && contents.isLoading(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      faviconUrl: this.#favicon.get(),
      failure: this.#failure ? { ...this.#failure } : null,
      loadPhase: this.#loadPhase,
      find: this.#controls.findState,
      zoomFactor: this.#controls.zoomFactor,
    };
  }
  public openFind(): void { this.#controls.openFind(); }
  public searchFind(query: string): void { this.#controls.searchFind(query); }
  public nextFind(direction: "next" | "previous"): void {
    this.#controls.nextFind(direction);
  }
  public closeFind(): void { this.#controls.closeFind(); }
  public zoom(action: BrowserZoomAction): void { this.#controls.zoom(action); }
  public destroy(): void {
    this.#controls.dispose();
    const contents = this.view.webContents as unknown as { destroy?: () => void };
    contents.destroy?.();
  }
  #homeUrl(): string {
    const task = this.presentation.homeTask();
    this.#homeTaskKey = browserHomeTaskKey(task);
    return browserHomeUrl(this.presentation.theme(), this.presentation.locale(),
      this.#internalToken, task);
  }
  #navigate(url: string): void {
    this.#failure = null;
    this.#failedNavigationUrl = null;
    this.#showingErrorPage = false;
    void this.view.webContents.loadURL(url);
  }

  #setPhase(phase: BrowserLoadPhase): void {
    this.#loadPhase = phase;
    this.onChange();
  }
}
