import type { BrowserNavigationFailure } from "../desktop/shared/types.js";

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
