import { BROWSER_SHELL_CHANNELS } from "./browser-ipc-channels.js";
import type { BrowserTabManager } from "./browser-tab-manager.js";

export class BrowserWindowTabCommands {
  public constructor(
    private readonly tabs: () => BrowserTabManager | undefined,
    private readonly focusShell: (channel: string) => boolean,
  ) {}

  public newTab(): boolean {
    const tabs = this.tabs();
    if (!tabs) return false;
    tabs.newTab();
    return this.focusShell(BROWSER_SHELL_CHANNELS.focusAddress);
  }

  public openFind(): boolean {
    const tab = this.tabs()?.activeTab();
    if (!tab) return false;
    tab.openFind();
    return this.focusShell(BROWSER_SHELL_CHANNELS.focusFind);
  }

  public searchFind(query: string): boolean {
    const tab = this.tabs()?.activeTab();
    if (!tab) return false;
    tab.searchFind(query);
    return true;
  }

  public findNext(direction: "next" | "previous"): boolean {
    const tab = this.tabs()?.activeTab();
    if (!tab) return false;
    const find = tab.getState().find;
    if (find.open && find.query) tab.nextFind(direction);
    else return this.openFind();
    return true;
  }

  public closeFind(): boolean {
    const tab = this.tabs()?.activeTab();
    if (!tab || !tab.getState().find.open) return false;
    tab.closeFind();
    tab.focus();
    return true;
  }

  public resetZoom(): boolean {
    const tab = this.tabs()?.activeTab();
    if (!tab) return false;
    tab.zoom("reset");
    tab.focus();
    return true;
  }
}
