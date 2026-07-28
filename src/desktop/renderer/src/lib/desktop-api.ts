import type { DesktopApi } from "@desktop/types";

import { createBrowserDemoApi } from "./demo/browser-demo-api";
import { createUnavailableDesktopApi } from "./unavailable-desktop-api";

export const desktopApi: DesktopApi =
  window.coolto ??
  (import.meta.env.DEV
    ? createBrowserDemoApi()
    : createUnavailableDesktopApi());
