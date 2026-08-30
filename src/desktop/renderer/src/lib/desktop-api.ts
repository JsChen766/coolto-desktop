import type { DesktopApi } from "@desktop/types";

import { createBrowserDemoApi } from "./demo/browser-demo-api";
import { createUnavailableDesktopApi } from "./unavailable-desktop-api";

const baseDesktopApi: DesktopApi =
  window.coolto ??
  (import.meta.env.DEV
    ? createBrowserDemoApi()
    : createUnavailableDesktopApi());

let overrideDesktopApi: DesktopApi | undefined;

export const desktopApi: DesktopApi = new Proxy({} as DesktopApi, {
  get: (_target, property) => Reflect.get(
    overrideDesktopApi ?? baseDesktopApi,
    property,
  ),
});

export function setDesktopApiOverride(api: DesktopApi | undefined): void {
  overrideDesktopApi = api;
}

export function getBaseDesktopApi(): DesktopApi {
  return baseDesktopApi;
}
