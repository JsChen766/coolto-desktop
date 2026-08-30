import {
  sanitizeFaviconUrl,
  shouldResetBrowserFavicon,
} from "./browser-tab-presentation.js";

export const MAX_BROWSER_FAVICON_ORIGINS = 32;

export class BrowserTabFaviconState {
  readonly #byOrigin = new Map<string, string>();
  #current: string | null = null;

  public get(): string | null { return this.#current; }

  public startNavigation(currentUrl: string, nextUrl: string): void {
    if (!this.#current || shouldResetBrowserFavicon(currentUrl, nextUrl)) {
      this.#current = this.#cached(nextUrl);
    }
  }

  public update(pageUrl: string, favicons: string[]): void {
    this.#current = favicons.map(sanitizeFaviconUrl)
      .find((url): url is string => Boolean(url)) ?? null;
    const origin = webOrigin(pageUrl);
    if (!origin) return;
    this.#byOrigin.delete(origin);
    if (!this.#current) return;
    this.#byOrigin.set(origin, this.#current);
    while (this.#byOrigin.size > MAX_BROWSER_FAVICON_ORIGINS) {
      const oldest = this.#byOrigin.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#byOrigin.delete(oldest);
    }
  }

  public clearForFailure(): void { this.#current = null; }

  #cached(url: string): string | null {
    const origin = webOrigin(url);
    if (!origin) return null;
    const favicon = this.#byOrigin.get(origin);
    if (!favicon) return null;
    this.#byOrigin.delete(origin);
    this.#byOrigin.set(origin, favicon);
    return favicon;
  }
}

function webOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
