import type { WebContents } from "electron";

import type { BrowserTabManager } from "./browser-tab-manager.js";
import type { ActiveTabContext } from "./browser-page-operator.js";
import type { BrowserWriteAccessGate } from "./browser-write-access-gate.js";

/**
 * B3: 活跃标签的 origin 追踪。BrowserWindowManager 每次 pushState 时调用 sync()，
 * 若活跃标签的 origin 已变（例如 did-navigate 到新站点），通知 gate 收回写权限。
 */
export class BrowserActiveOriginTracker {
  #tabId: string | null = null;
  #origin: string | null = null;

  public constructor(
    private readonly gate: BrowserWriteAccessGate,
    private readonly onRevoked: () => void = () => undefined,
  ) {}

  public sync(tabs: BrowserTabManager | undefined): boolean {
    let accessChanged = false;
    const access = this.gate.snapshot();
    if (access.granted && access.tabId && !tabs?.tab(access.tabId)) {
      this.gate.revoke("authorized-tab-closed");
      this.onRevoked();
      accessChanged = true;
    }
    const active = tabs?.activeTab();
    if (!active) {
      const changed = this.#tabId !== null;
      this.#tabId = null;
      this.#origin = null;
      return changed || accessChanged;
    }
    const origin = originOf(active.view.webContents.getURL());
    if (active.id !== this.#tabId) {
      this.#tabId = active.id;
      this.#origin = origin;
      return true;
    }
    if (origin !== this.#origin) {
      if (this.gate.onOriginChanged(active.id, origin)) this.onRevoked();
      this.#origin = origin;
      return true;
    }
    return accessChanged;
  }
}

export function activeTabContext(
  tabs: BrowserTabManager | undefined,
): ActiveTabContext | null {
  const active = tabs?.activeTab();
  if (!active) return null;
  return {
    tabId: active.id,
    origin: originOf(active.view.webContents.getURL()),
    webContents: active.view.webContents as WebContents,
  };
}

export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
