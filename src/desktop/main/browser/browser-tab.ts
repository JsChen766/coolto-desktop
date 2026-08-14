import { randomUUID } from "node:crypto";

import { app, WebContentsView, type Rectangle } from "electron";

import type { BrowserTabState } from "../../shared/types.js";
import { BROWSER_HOME_URL, isBrowserHomeUrl } from "./browser-home-page.js";
import { getBrowserSession } from "./browser-session.js";
import { buildBrowserUserAgent } from "./browser-user-agent.js";

/**
 * B1: 单个标签页，封装一个 WebContentsView。
 * 内容页面运行在独立 WebContentsView 中，与浏览器 chrome（标签栏）隔离。
 */
export class BrowserTab {
  readonly id = randomUUID();
  readonly view: WebContentsView;

  public constructor(onChange: () => void, onOpenUrl: (url: string) => void) {
    this.view = new WebContentsView({
      webPreferences: {
        session: getBrowserSession(),
        contextIsolation: true,
        devTools: !app.isPackaged,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const contents = this.view.webContents;
    contents.setUserAgent(
      buildBrowserUserAgent({
        chromeVersion: process.versions.chrome,
        platform: process.platform,
      }),
    );
    contents.setWindowOpenHandler(({ url }) => {
      onOpenUrl(url);
      return { action: "deny" };
    });
    const events = [
      "did-navigate",
      "did-navigate-in-page",
      "page-title-updated",
      "did-start-loading",
      "did-stop-loading",
      "did-finish-load",
      "did-fail-load",
    ] as const;
    for (const event of events) {
      contents.on(event, () => onChange());
    }
  }

  public loadUrl(url?: string): void {
    void this.view.webContents.loadURL(url?.trim() || BROWSER_HOME_URL);
  }

  public setBounds(bounds: Rectangle): void {
    this.view.setBounds(bounds);
  }

  public setVisible(visible: boolean): void {
    this.view.setVisible(visible);
  }

  public goBack(): void {
    const history = this.view.webContents.navigationHistory;
    if (history.canGoBack()) history.goBack();
  }

  public goForward(): void {
    const history = this.view.webContents.navigationHistory;
    if (history.canGoForward()) history.goForward();
  }

  public reload(): void {
    this.view.webContents.reload();
  }

  public navigate(url: string): void {
    const target = url.trim();
    if (target) void this.view.webContents.loadURL(target);
  }

  public getState(): BrowserTabState {
    const contents = this.view.webContents;
    const rawUrl = contents.getURL();
    const isHome = isBrowserHomeUrl(rawUrl);
    return {
      id: this.id,
      title: isHome ? "新标签页" : contents.getTitle() || "加载中…",
      url: !rawUrl || isHome ? null : rawUrl,
      isLoading: contents.isLoading(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
    };
  }

  public destroy(): void {
    const contents = this.view.webContents as unknown as {
      destroy?: () => void;
    };
    contents.destroy?.();
  }
}
