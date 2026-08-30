import { ipcRenderer } from "electron";

import type { OnboardingDesktopApi } from "../shared/types.js";

export const onboardingPreloadApi: OnboardingDesktopApi = {
  status: () => ipcRenderer.invoke("onboarding:status"),
  start: (locale) => ipcRenderer.invoke("onboarding:start", locale),
  advance: (action, locale) =>
    ipcRenderer.invoke("onboarding:advance", action, locale),
  openBrowserDemo: (theme) =>
    ipcRenderer.invoke("onboarding:browser-demo", theme),
  complete: (locale) => ipcRenderer.invoke("onboarding:complete", locale),
};
