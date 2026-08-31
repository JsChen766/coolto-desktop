import type { IpcMain } from "electron";

import type {
  OnboardingAction,
  OnboardingLocale,
  OnboardingStep,
} from "../../shared/types.js";
import type { UserServices } from "../user-services.js";

type CurrentUserServices = () => Promise<UserServices>;

const ACTIONS = new Set<OnboardingAction>([
  "accept_sample_profile",
  "view_sample_experience",
  "generate_sample_resume",
  "open_browser_demo",
  "finish_browser_demo",
  "view_sample_application",
]);

export function registerOnboardingIpc(
  ipcMain: IpcMain,
  servicesForCurrentUser: CurrentUserServices,
): void {
  ipcMain.handle("onboarding:status", async () =>
    (await servicesForCurrentUser()).onboarding.status());
  ipcMain.handle("onboarding:start", async (_event, locale: unknown) =>
    (await servicesForCurrentUser()).onboarding.start(readLocale(locale)));
  ipcMain.handle("onboarding:advance", async (_event, action: unknown, locale: unknown) => {
    if (!ACTIONS.has(action as OnboardingAction)) {
      throw new Error("无效的首次体验动作");
    }
    return (await servicesForCurrentUser()).onboarding.advance(
      action as OnboardingAction, readLocale(locale),
    );
  });
  ipcMain.handle("onboarding:browser-demo", async (_event, theme: unknown) => {
    const current = await servicesForCurrentUser();
    const status = await current.onboarding.status();
    requireStep(status.step, "browser_review");
    await current.onboardingBrowser.openAndFill(
      theme === "dark" ? "dark" : "light",
    );
  });
  ipcMain.handle("onboarding:complete", async (_event, locale: unknown) => {
    const current = await servicesForCurrentUser();
    const status = await current.onboarding.status();
    requireStep(status.step, "complete");
    await current.onboardingBrowser.cleanup();
    return current.onboarding.complete(readLocale(locale));
  });
}

function readLocale(value: unknown): OnboardingLocale {
  return value === "en-US" ? "en-US" : "zh-CN";
}

function requireStep(actual: OnboardingStep, expected: OnboardingStep): void {
  if (actual !== expected) {
    throw new Error(`首次体验步骤已变化：当前 ${actual}，预期 ${expected}`);
  }
}

export const ONBOARDING_IPC_CHANNELS = [
  "onboarding:status",
  "onboarding:start",
  "onboarding:advance",
  "onboarding:browser-demo",
  "onboarding:complete",
] as const;
