import type { ConversationDetail } from "./conversations.js";

export const ONBOARDING_VERSION = 1;

export type OnboardingStep =
  | "welcome"
  | "experience"
  | "resume"
  | "browser"
  | "browser_review"
  | "tracker"
  | "complete"
  | "completed";

export type OnboardingAction =
  | "accept_sample_profile"
  | "view_sample_experience"
  | "generate_sample_resume"
  | "open_browser_demo"
  | "finish_browser_demo"
  | "view_sample_application";
export type OnboardingLocale = "zh-CN" | "en-US";

export interface OnboardingStatus {
  version: typeof ONBOARDING_VERSION;
  state: "not_started" | "in_progress" | "completed";
  step: OnboardingStep;
  conversationId: string | null;
  completedAt: string | null;
}

export interface OnboardingResult {
  status: OnboardingStatus;
  conversation: ConversationDetail | null;
}

export interface OnboardingDesktopApi {
  status(): Promise<OnboardingStatus>;
  start(locale: OnboardingLocale): Promise<OnboardingResult>;
  advance(action: OnboardingAction, locale: OnboardingLocale): Promise<OnboardingResult>;
  openBrowserDemo(theme: "light" | "dark"): Promise<void>;
  skip(): Promise<OnboardingResult>;
  complete(locale: OnboardingLocale): Promise<OnboardingResult>;
}
