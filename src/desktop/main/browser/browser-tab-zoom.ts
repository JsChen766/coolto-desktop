import {
  DEFAULT_BROWSER_ZOOM_FACTOR,
  stepBrowserZoomFactor,
} from "../../../browser/browser-zoom.js";

export type BrowserZoomAction = "in" | "out" | "reset";

export interface BrowserZoomContents {
  isDestroyed?(): boolean;
  setZoomFactor(factor: number): void;
}

export class BrowserTabZoomController {
  #active = false;
  #factor = DEFAULT_BROWSER_ZOOM_FACTOR;

  public constructor(
    private readonly contents: BrowserZoomContents,
    private readonly onChange: () => void,
  ) {}

  public getFactor(): number {
    return this.#factor;
  }

  public setActive(active: boolean): void {
    this.#active = active;
    if (active) this.#applySavedFactor();
  }

  public onNavigation(): void {
    if (this.#active) this.#applySavedFactor();
  }

  public change(action: BrowserZoomAction): void {
    const next = action === "reset"
      ? DEFAULT_BROWSER_ZOOM_FACTOR
      : stepBrowserZoomFactor(this.#factor, action);
    if (next === this.#factor) return;
    this.#factor = next;
    if (this.#active) this.#applySavedFactor();
    this.onChange();
  }

  #applySavedFactor(): void {
    if (!this.contents.isDestroyed?.()) {
      this.contents.setZoomFactor(this.#factor);
    }
  }
}
