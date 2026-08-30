import { randomUUID } from "node:crypto";

import { app, WebContentsView, type Rectangle } from "electron";

import {
  browserNavigationFailure,
  sanitizeFaviconUrl,
} from "../../../browser/browser-tab-presentation.js";
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
import { browserHomeUrl, isBrowserHomeUrl } from "./browser-home-page.js";
import { getBrowserSession } from "./browser-session.js";
import { buildBrowserUserAgent } from "./browser-user-agent.js";

export interface BrowserTabPresentationContext {
  locale: () => BrowserLocale;
  theme: () => "light" | "dark";
}

export class BrowserTab {
  readonly id = randomUUID();
  readonly view: WebContentsView;
  #failure: BrowserTabState["failure"] = null;
  #faviconUrl: string | null = null;
  #loadPhase: BrowserLoadPhase = "idle";
  #showingErrorPage = false;

  public constructor(
    private readonly onChange: () => void,
    onOpenUrl: (url: string) => void,
    private readonly presentation: BrowserTabPresentationContext,
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        session: getBrowserSession(), contextIsolation: true,
        devTools: !app.isPackaged, nodeIntegration: false, sandbox: true,
      },
    });
    const contents = this.view.webContents;
    contents.setUserAgent(buildBrowserUserAgent({
      chromeVersion: process.versions.chrome, platform: process.platform,
    }));
    contents.setWindowOpenHandler(({ url }) => {
      onOpenUrl(url);
      return { action: "deny" };
    });
    contents.on("did-start-navigation", (details) => {
      if (!details.isMainFrame || details.isSameDocument) return;
      if (this.#showingErrorPage && isBrowserErrorUrl(details.url)) return;
      this.#showingErrorPage = false;
      this.#failure = null;
      this.#faviconUrl = null;
      this.#setPhase("starting");
    });
    contents.on("did-start-loading", () => {
      if (!this.#showingErrorPage) this.#setPhase("starting");
    });
    contents.on("did-navigate", (_event, url) => {
      if (!isBrowserErrorUrl(url)) this.#setPhase("committed");
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
      this.#faviconUrl = favicons.map(sanitizeFaviconUrl)
        .find((url): url is string => Boolean(url)) ?? null;
      this.onChange();
    });
    contents.on("did-fail-load", (
      _event, code, description, url, isMainFrame,
    ) => {
      if (!isMainFrame || code === -3 || isBrowserInternalUrl(url)) return;
      this.#failure = browserNavigationFailure(code, description, url);
      this.#faviconUrl = null;
      this.#loadPhase = "failed";
      this.#showingErrorPage = true;
      this.onChange();
      void contents.loadURL(browserErrorUrl({
        failure: this.#failure,
        locale: this.presentation.locale(),
        theme: this.presentation.theme(),
      }));
    });
  }

  public loadUrl(url?: string): void {
    this.#navigate(url?.trim() || this.#homeUrl());
  }

  public navigate(url: string): void {
    const target = url.trim();
    if (target) this.#navigate(target);
  }

  public stop(): void {
    this.view.webContents.stop();
    if (!this.#failure) this.#setPhase("complete");
  }

  public refreshInternalPresentation(): void {
    const url = this.view.webContents.getURL();
    if (isBrowserHomeUrl(url)) {
      this.#navigate(this.#homeUrl());
    } else if (isBrowserErrorUrl(url) && this.#failure) {
      this.#showingErrorPage = true;
      void this.view.webContents.loadURL(browserErrorUrl({
        failure: this.#failure,
        locale: this.presentation.locale(),
        theme: this.presentation.theme(),
      }));
    }
  }

  public setBounds(bounds: Rectangle): void { this.view.setBounds(bounds); }
  public setVisible(visible: boolean): void { this.view.setVisible(visible); }
  public goBack(): void {
    const history = this.view.webContents.navigationHistory;
    if (history.canGoBack()) history.goBack();
  }
  public goForward(): void {
    const history = this.view.webContents.navigationHistory;
    if (history.canGoForward()) history.goForward();
  }
  public reload(): void { this.view.webContents.reload(); }

  public getState(): BrowserTabState {
    const contents = this.view.webContents;
    const rawUrl = contents.getURL();
    const home = isBrowserHomeUrl(rawUrl);
    const failed = isBrowserErrorUrl(rawUrl) && this.#failure;
    return {
      id: this.id,
      title: home ? this.presentation.locale() === "en-US" ? "New tab" : "新标签页"
        : failed ? browserErrorTitle(this.presentation.locale())
          : contents.getTitle() || (this.presentation.locale() === "en-US" ? "Loading…" : "加载中…"),
      url: home ? null : failed ? this.#failure!.url : rawUrl || null,
      isLoading: !this.#showingErrorPage && contents.isLoading(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      faviconUrl: this.#faviconUrl,
      failure: this.#failure ? { ...this.#failure } : null,
      loadPhase: this.#loadPhase,
    };
  }

  public destroy(): void {
    const contents = this.view.webContents as unknown as { destroy?: () => void };
    contents.destroy?.();
  }

  #homeUrl(): string {
    return browserHomeUrl(this.presentation.theme(), this.presentation.locale());
  }

  #navigate(url: string): void {
    this.#failure = null;
    this.#showingErrorPage = false;
    void this.view.webContents.loadURL(url);
  }

  #setPhase(phase: BrowserLoadPhase): void {
    this.#loadPhase = phase;
    this.onChange();
  }
}
