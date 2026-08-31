import type { BrowserPermissionNotice } from "../../shared/types.js";
import { onBrowserPermissionDenied } from "./browser-session.js";

export class BrowserPermissionStatusBridge {
  #notice: BrowserPermissionNotice | null = null;
  readonly #unsubscribe: () => void;

  public constructor(changed: () => void) {
    this.#unsubscribe = onBrowserPermissionDenied((event) => {
      this.#notice = { ...event, createdAt: new Date().toISOString() };
      changed();
    });
  }

  public get(): BrowserPermissionNotice | null {
    return this.#notice ? { ...this.#notice } : null;
  }

  public dismiss(): void {
    this.#notice = null;
  }

  public dispose(): void {
    this.#unsubscribe();
    this.#notice = null;
  }
}
