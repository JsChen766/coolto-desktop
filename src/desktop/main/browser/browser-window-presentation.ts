import type {
  BrowserLocale,
  BrowserOpenInput,
} from "../../shared/types.js";

export class BrowserWindowPresentation {
  #locale: BrowserLocale = "zh-CN";
  #theme: "light" | "dark" = "light";

  public get locale(): BrowserLocale { return this.#locale; }
  public get theme(): "light" | "dark" { return this.#theme; }

  public apply(input?: BrowserOpenInput): boolean {
    const changed = Boolean(
      input?.theme && input.theme !== this.#theme ||
      input?.locale && input.locale !== this.#locale,
    );
    if (input?.theme) this.#theme = input.theme;
    if (input?.locale) this.#locale = input.locale;
    return changed;
  }

  public setLocale(locale?: BrowserLocale): boolean {
    if (!locale || locale === this.#locale) return false;
    this.#locale = locale;
    return true;
  }
}
