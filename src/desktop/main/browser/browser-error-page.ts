import type {
  BrowserLocale,
  BrowserNavigationFailure,
} from "../../shared/types.js";
import { browserHomeUrl, isBrowserHomeUrl } from "./browser-home-page.js";

const ERROR_MARKER = "#coolto-browser-error";

export function browserErrorUrl(input: {
  failure: BrowserNavigationFailure;
  internalToken: string;
  locale: BrowserLocale;
  retryUrl: string;
  theme: "light" | "dark";
}): string {
  const { failure, internalToken, locale, retryUrl, theme } = input;
  const copy = errorCopy(locale, failure.code);
  const dark = theme === "dark";
  const homeUrl = browserHomeUrl(theme, locale, internalToken);
  const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="${theme}" /><title>${copy.title}</title>
<style>
  :root { color-scheme: ${theme}; } * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    padding: 32px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI",
      "PingFang SC", "Microsoft YaHei", sans-serif;
    background: ${dark ? "#1b1b19" : "#fbfbfa"}; color: ${dark ? "#edede8" : "#20201e"}; }
  main { width: min(620px, 100%); display: grid; gap: 16px; }
  h1 { margin: 0; font-size: 26px; line-height: 1.25; letter-spacing: -.025em; }
  p { margin: 0; color: ${dark ? "#b5b2aa" : "#4a4944"}; line-height: 1.6; }
  code { display: block; overflow-wrap: anywhere; color: ${dark ? "#85827a" : "#7b7971"};
    font: 12px/1.5 "SFMono-Regular", Consolas, monospace; }
  nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  a { min-height: 38px; display: inline-flex; align-items: center; padding: 0 14px;
    border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; }
  .primary { background: ${dark ? "#edede8" : "#20201e"};
    color: ${dark ? "#20201e" : "#fbfbfa"}; }
  .secondary { border: 1px solid ${dark ? "#494943" : "#d6d5d0"}; color: inherit; }
</style></head><body><main>
  <h1>${copy.title}</h1><p>${copy.detail}</p>
  <code>${escapeHtml(failure.url)}</code><code>${escapeHtml(failure.description)} (${failure.code})</code>
  <nav><a class="primary" href="${escapeAttribute(retryUrl)}">${copy.retry}</a>
    <a class="secondary" href="${escapeAttribute(homeUrl)}">${copy.home}</a></nav>
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}${errorMarker(internalToken)}`;
}

export function isBrowserErrorUrl(url: string, internalToken: string): boolean {
  return url.endsWith(errorMarker(internalToken));
}

export function isBrowserInternalUrl(url: string, internalToken: string): boolean {
  return isBrowserErrorUrl(url, internalToken) || isBrowserHomeUrl(url, internalToken);
}

function errorMarker(internalToken: string): string {
  return `${ERROR_MARKER}:${encodeURIComponent(internalToken)}`;
}

export function browserErrorTitle(locale: BrowserLocale): string {
  return locale === "en-US" ? "Page unavailable" : "无法打开页面";
}

function errorCopy(locale: BrowserLocale, code: number) {
  const offline = code === -106;
  const dns = code === -105;
  if (locale === "en-US") return {
    detail: offline ? "Check your connection, then try again."
      : dns ? "Check the address for typing errors, then try again."
        : "The site did not respond. You can retry or return to the new tab page.",
    home: "Open new tab",
    retry: "Retry page",
    title: offline ? "You appear to be offline" : dns ? "Site not found" : "Page unavailable",
  };
  return {
    detail: offline ? "请检查网络连接，然后重试。"
      : dns ? "请检查网址是否正确，然后重试。"
        : "站点没有正常响应。你可以重试，或返回新标签页。",
    home: "打开新标签页",
    retry: "重试页面",
    title: offline ? "当前似乎没有网络" : dns ? "找不到这个站点" : "无法打开页面",
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/gu, "&#96;");
}
