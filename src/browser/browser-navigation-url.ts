export const MAX_BROWSER_NAVIGATION_URL_LENGTH = 16_384;

export function normalizeBrowserNavigationUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (
    !candidate ||
    candidate.length > MAX_BROWSER_NAVIGATION_URL_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    return null;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const normalized = url.toString();
    return normalized.length <= MAX_BROWSER_NAVIGATION_URL_LENGTH ? normalized : null;
  } catch {
    return null;
  }
}
