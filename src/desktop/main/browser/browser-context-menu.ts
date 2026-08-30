import {
  clipboard,
  Menu,
  type BrowserWindow,
  type ContextMenuParams,
  type WebContents,
} from "electron";

import {
  deriveBrowserContextMenuPolicy,
  safeBrowserContextLinkUrl,
} from "../../../browser/browser-context-menu-policy.js";
import type { BrowserLocale } from "../../shared/types.js";

export function attachBrowserContextMenu(
  contents: WebContents,
  input: {
    locale: () => BrowserLocale;
    openUrl: (url: string) => void;
    window: () => BrowserWindow | undefined;
  },
): () => void {
  const listener = (_event: Electron.Event, params: ContextMenuParams): void => {
    const policy = deriveBrowserContextMenuPolicy(params);
    const copy = menuCopy(input.locale());
    const action = (handler: () => void) => guardedAction(contents, input.window, handler);
    const template: Electron.MenuItemConstructorOptions[] = [
      { id: "browser-back", label: copy.back, enabled: contents.navigationHistory.canGoBack(),
        click: action(() => contents.navigationHistory.goBack()) },
      { id: "browser-forward", label: copy.forward,
        enabled: contents.navigationHistory.canGoForward(),
        click: action(() => contents.navigationHistory.goForward()) },
      { id: "browser-reload", label: copy.reload,
        click: action(() => contents.reload()) },
    ];
    if (policy.canCopySelection) {
      template.push({ type: "separator" });
      template.push({ id: "browser-copy", label: copy.copy,
        click: action(() => contents.copy()) });
    }
    if (policy.linkUrl) {
      const linkUrl = policy.linkUrl;
      template.push(
        { type: "separator" },
        { id: "browser-open-link", label: copy.openLink,
          click: action(() => {
            const safeUrl = safeBrowserContextLinkUrl(linkUrl);
            if (safeUrl) input.openUrl(safeUrl);
          }) },
        { id: "browser-copy-link", label: copy.copyLink,
          click: action(() => {
            const safeUrl = safeBrowserContextLinkUrl(linkUrl);
            if (safeUrl) clipboard.writeText(safeUrl);
          }) },
      );
    }
    const window = input.window();
    if (!window || window.isDestroyed() || contents.isDestroyed()) return;
    Menu.buildFromTemplate(template).popup({ window });
  };
  contents.on("context-menu", listener);
  return () => {
    if (!contents.isDestroyed()) contents.removeListener("context-menu", listener);
  };
}

function guardedAction(
  contents: WebContents,
  window: () => BrowserWindow | undefined,
  action: () => void,
): () => void {
  return () => {
    const owner = window();
    if (!owner || owner.isDestroyed() || contents.isDestroyed()) return;
    action();
  };
}

function menuCopy(locale: BrowserLocale) {
  return locale === "en-US" ? {
    back: "Back", copy: "Copy", copyLink: "Copy link",
    forward: "Forward", openLink: "Open link in new tab",
    reload: "Reload",
  } : {
    back: "后退", copy: "复制", copyLink: "复制链接",
    forward: "前进", openLink: "在新标签页中打开链接",
    reload: "重新加载",
  };
}
