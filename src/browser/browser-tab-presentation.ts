import type { BrowserNavigationFailure } from "../desktop/shared/types.js";
import { normalizeBrowserNavigationUrl } from "./browser-navigation-url.js";

const DATA_IMAGE_PATTERN = /^data:image\/(?:gif|jpeg|png|webp|x-icon);/iu;

export function sanitizeFaviconUrl(value: string): string | null {
  const candidate = value.trim().slice(0, 4_096);
  if (DATA_IMAGE_PATTERN.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function shouldResetBrowserFavicon(
  currentUrl: string,
  nextUrl: string,
): boolean {
  try {
    const current = new URL(currentUrl);
    const next = new URL(nextUrl);
    const currentIsWeb = current.protocol === "http:" || current.protocol === "https:";
    const nextIsWeb = next.protocol === "http:" || next.protocol === "https:";
    return !currentIsWeb || !nextIsWeb || current.origin !== next.origin;
  } catch {
    return true;
  }
}

export function browserNavigationFailure(
  code: number,
  description: string,
  url: string,
): BrowserNavigationFailure {
  return {
    code,
    description: description.trim().slice(0, 300) || "Navigation failed",
    url: sanitizeVisibleUrl(url),
  };
}

export function browserNavigationFailureRecord(
  code: number,
  description: string,
  url: string,
): { failure: BrowserNavigationFailure; retryUrl: string | null } {
  return {
    failure: browserNavigationFailure(code, description, url),
    retryUrl: normalizeBrowserNavigationUrl(url),
  };
}

function sanitizeVisibleUrl(value: string): string {
  const candidate = value.trim().slice(0, 4_096);
  try {
    const url = new URL(candidate);
    if (url.password) url.password = "••••";
    return url.toString();
  } catch {
    return candidate || "about:blank";
  }
}
