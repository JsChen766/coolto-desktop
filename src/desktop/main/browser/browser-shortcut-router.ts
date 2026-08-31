import type { Event as ElectronEvent, Input } from "electron";

import {
  resolveBrowserShortcut,
  type BrowserShortcutContext,
  type BrowserShortcutIntent,
} from "../../../browser/browser-shortcut-policy.js";

type ShortcutResult = boolean;
type TabDirection = "next" | "previous";
type ZoomAction = "in" | "out" | "reset";

export interface BrowserShortcutHandlers {
  getContext(): BrowserShortcutContext;
  focusAddress(): ShortcutResult;
  newTab(): ShortcutResult;
  closeTab(): ShortcutResult;
  cycleTab(direction: TabDirection): ShortcutResult;
  selectTab(index: number): ShortcutResult;
  selectLastTab(): ShortcutResult;
  reload(): ShortcutResult;
  stopLoading(): ShortcutResult;
  goBack(): ShortcutResult;
  goForward(): ShortcutResult;
  openFind(): ShortcutResult;
  closeFind(): ShortcutResult;
  closeDownloads(): ShortcutResult;
  closeInspector(): ShortcutResult;
  findNext(direction: TabDirection): ShortcutResult;
  zoom(action: ZoomAction): ShortcutResult;
}

type BeforeInputListener = (event: ElectronEvent, input: Input) => void;

export interface BrowserShortcutContents {
  isDestroyed?(): boolean;
  on(event: "before-input-event", listener: BeforeInputListener): unknown;
  off(event: "before-input-event", listener: BeforeInputListener): unknown;
}

export class BrowserShortcutRouter {
  public constructor(
    private readonly handlers: BrowserShortcutHandlers,
    private readonly platform = process.platform,
  ) {}

  public attach(contents: BrowserShortcutContents): () => void {
    const listener: BeforeInputListener = (event, input) => {
      const intent = resolveBrowserShortcut(
        input,
        this.platform,
        this.handlers.getContext(),
      );
      if (!intent) return;
      event.preventDefault();
      dispatchShortcut(intent, this.handlers);
    };
    contents.on("before-input-event", listener);
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      if (!contents.isDestroyed?.()) contents.off("before-input-event", listener);
    };
  }
}

function dispatchShortcut(
  intent: BrowserShortcutIntent,
  handlers: BrowserShortcutHandlers,
): boolean {
  switch (intent.kind) {
    case "focus-address": return handlers.focusAddress();
    case "new-tab": return handlers.newTab();
    case "close-tab": return handlers.closeTab();
    case "cycle-tab": return handlers.cycleTab(intent.direction);
    case "select-tab": return handlers.selectTab(intent.index);
    case "select-last-tab": return handlers.selectLastTab();
    case "reload": return handlers.reload();
    case "stop-loading": return handlers.stopLoading();
    case "go-back": return handlers.goBack();
    case "go-forward": return handlers.goForward();
    case "open-find": return handlers.openFind();
    case "close-find": return handlers.closeFind();
    case "close-downloads": return handlers.closeDownloads();
    case "close-inspector": return handlers.closeInspector();
    case "find-next": return handlers.findNext(intent.direction);
    case "zoom": return handlers.zoom(intent.action);
  }
}
