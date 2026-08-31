import {
  MAX_BROWSER_NAVIGATION_URL_LENGTH,
  normalizeBrowserNavigationUrl,
} from "../../../browser/browser-navigation-url.js";

export type BrowserInitialNavigationKind = "external" | "host-internal";

export function browserInitialNavigationUrl(
  value: string | undefined,
  homeUrl: string,
  kind: BrowserInitialNavigationKind,
): string {
  const target = value?.trim();
  if (!target) return homeUrl;
  if (kind === "external") return normalizeBrowserNavigationUrl(target) ?? homeUrl;
  if (
    target.length > MAX_BROWSER_NAVIGATION_URL_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(target) ||
    !/^data:text\/html;charset=utf-8,/iu.test(target)
  ) {
    throw new Error("宿主内部页面地址无效");
  }
  return target;
}
