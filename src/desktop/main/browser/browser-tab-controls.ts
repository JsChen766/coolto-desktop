import type { BrowserWindow, WebContents } from "electron";

import { normalizeBrowserNavigationUrl } from "../../../browser/browser-navigation-url.js";
import type {
  BrowserFindState,
  BrowserLocale,
} from "../../shared/types.js";
import { attachBrowserContextMenu } from "./browser-context-menu.js";
import { isBrowserInternalUrl } from "./browser-error-page.js";
import type { BrowserShortcutRouter } from "./browser-shortcut-router.js";
import { BrowserTabFindController } from "./browser-tab-find.js";
import {
  BrowserTabZoomController,
  type BrowserZoomAction,
} from "./browser-tab-zoom.js";

export class BrowserTabControls {
  readonly #detachContextMenu: () => void;
  readonly #detachNavigation: () => void;
  readonly #detachShortcut: () => void;
  readonly #find: BrowserTabFindController;
  readonly #zoom: BrowserTabZoomController;

  public constructor(input: {
    contents: WebContents;
    internalToken: string;
    locale: () => BrowserLocale;
    onChange: () => void;
    openUrl: (url: string) => void;
    shortcutRouter: BrowserShortcutRouter;
    window: () => BrowserWindow | undefined;
  }) {
    this.#find = new BrowserTabFindController(input.contents, input.onChange);
    this.#zoom = new BrowserTabZoomController(input.contents, input.onChange);
    this.#detachShortcut = input.shortcutRouter.attach(input.contents);
    const onNavigate = (event: Electron.Event, url: string): void => {
      if (!isBrowserInternalUrl(url, input.internalToken) &&
        !normalizeBrowserNavigationUrl(url)) event.preventDefault();
    };
    input.contents.on("will-navigate", onNavigate);
    input.contents.on("will-redirect", onNavigate);
    input.contents.setWindowOpenHandler(({ url }) => {
      const target = normalizeBrowserNavigationUrl(url);
      if (target) input.openUrl(target);
      return { action: "deny" };
    });
    this.#detachNavigation = () => {
      if (input.contents.isDestroyed()) return;
      input.contents.off("will-navigate", onNavigate);
      input.contents.off("will-redirect", onNavigate);
    };
    this.#detachContextMenu = attachBrowserContextMenu(input.contents, {
      locale: input.locale,
      openUrl: input.openUrl,
      window: input.window,
    });
  }

  public get findState(): BrowserFindState { return this.#find.getState(); }
  public get zoomFactor(): number { return this.#zoom.getFactor(); }

  public setActive(active: boolean): void { this.#zoom.setActive(active); }
  public resetOnNavigation(): void { this.#find.resetOnNavigation(); }
  public onNavigation(): void { this.#zoom.onNavigation(); }
  public openFind(): void { this.#find.open(); }
  public searchFind(query: string): void { this.#find.search(query); }
  public nextFind(direction: "next" | "previous"): void {
    this.#find.next(direction);
  }
  public closeFind(): void { this.#find.close(); }
  public zoom(action: BrowserZoomAction): void { this.#zoom.change(action); }

  public dispose(): void {
    this.#find.dispose();
    this.#detachNavigation();
    this.#detachShortcut();
    this.#detachContextMenu();
  }
}
