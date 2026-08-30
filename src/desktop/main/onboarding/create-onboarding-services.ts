import type { BrowserPageOperator } from "../../../browser/types.js";
import type { BrowserWindowManager } from "../browser/browser-window-manager.js";
import type { ConversationStore } from "../conversation-store.js";
import { ElectronOnboardingStateRepository } from
  "./electron-onboarding-state.js";
import { OnboardingBrowserDemo } from "./onboarding-browser-demo.js";
import { OnboardingService } from "./onboarding-service.js";

export function createOnboardingServices(input: {
  ownerId: string;
  conversations: ConversationStore;
  browserWindow: BrowserWindowManager;
  browserPageOperator: BrowserPageOperator;
}): {
  onboarding: OnboardingService;
  onboardingBrowser: OnboardingBrowserDemo;
} {
  return {
    onboarding: new OnboardingService(
      new ElectronOnboardingStateRepository(input.ownerId),
      input.conversations,
    ),
    onboardingBrowser: new OnboardingBrowserDemo(
      input.ownerId,
      input.browserWindow,
      input.browserPageOperator,
    ),
  };
}
