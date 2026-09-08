import type { AgentMessage } from "@earendil-works/pi-agent-core";

import {
  ONBOARDING_VERSION,
  type ConversationDetail,
  type OnboardingAction,
  type OnboardingLocale,
  type OnboardingResult,
  type OnboardingStatus,
  type OnboardingStep,
} from "../../shared/types.js";
import {
  onboardingCompletedMessages,
  onboardingIntroMessage,
  onboardingStepMessages,
} from "./onboarding-script.js";

export interface OnboardingStateRepository {
  read(): Promise<OnboardingStatus | undefined>;
  write(status: OnboardingStatus): Promise<void>;
}

export interface OnboardingConversationStore {
  create(): Promise<ConversationDetail>;
  get(conversationId: string): Promise<ConversationDetail>;
  loadMessages(conversationId: string): Promise<AgentMessage[]>;
  saveMessages(conversationId: string, messages: AgentMessage[]): Promise<ConversationDetail>;
  rename(conversationId: string, title: string): Promise<unknown>;
}

const TRANSITIONS: Record<OnboardingAction, readonly [OnboardingStep, OnboardingStep]> = {
  accept_sample_profile: ["welcome", "experience"],
  view_sample_experience: ["experience", "resume"],
  generate_sample_resume: ["resume", "browser"],
  open_browser_demo: ["browser", "browser_review"],
  finish_browser_demo: ["browser_review", "tracker"],
  view_sample_application: ["tracker", "complete"],
};

export class OnboardingService {
  public constructor(
    private readonly state: OnboardingStateRepository,
    private readonly conversations: OnboardingConversationStore,
  ) {}

  public async status(): Promise<OnboardingStatus> {
    return (await this.state.read()) ?? initialStatus();
  }

  public async start(locale: OnboardingLocale): Promise<OnboardingResult> {
    const current = await this.status();
    if (current.state === "completed") return { status: current, conversation: null };
    if (current.conversationId) {
      const existing = await this.#conversationOrNull(current.conversationId);
      if (existing) return { status: current, conversation: existing };
    }
    const created = await this.conversations.create();
    await this.conversations.rename(created.id, "开始使用 Coolto");
    const conversation = await this.conversations.saveMessages(
      created.id,
      [onboardingIntroMessage(locale)],
    );
    const status: OnboardingStatus = {
      version: ONBOARDING_VERSION,
      state: "in_progress",
      step: "welcome",
      conversationId: created.id,
      completedAt: null,
    };
    await this.state.write(status);
    return { status, conversation };
  }

  public async advance(
    action: OnboardingAction,
    locale: OnboardingLocale,
  ): Promise<OnboardingResult> {
    const current = await this.#requireActive();
    const [expected, next] = TRANSITIONS[action];
    if (current.step !== expected) {
      throw new Error(`引导步骤已变化：当前 ${current.step}，不能执行 ${action}`);
    }
    const conversation = await this.#append(
      current.conversationId!,
      (timestamp) => onboardingStepMessages(action, timestamp, locale),
    );
    const status = { ...current, step: next };
    await this.state.write(status);
    return { status, conversation };
  }

  public async complete(locale: OnboardingLocale): Promise<OnboardingResult> {
    const current = await this.#requireActive();
    if (current.step !== "complete") throw new Error("引导尚未完成全部真实流程");
    const conversation = await this.#append(
      current.conversationId!,
      (timestamp) => onboardingCompletedMessages(timestamp, locale),
    );
    const status: OnboardingStatus = {
      ...current,
      state: "completed",
      step: "completed",
      completedAt: new Date().toISOString(),
    };
    await this.state.write(status);
    return { status, conversation };
  }

  public async skip(): Promise<OnboardingResult> {
    const current = await this.status();
    if (current.state === "completed") {
      return {
        status: current,
        conversation: current.conversationId
          ? await this.#conversationOrNull(current.conversationId) : null,
      };
    }
    const conversation = current.conversationId
      ? await this.#resetConversation(current.conversationId) : null;
    const status: OnboardingStatus = {
      ...current,
      state: "completed",
      step: "completed",
      completedAt: new Date().toISOString(),
    };
    await this.state.write(status);
    return { status, conversation };
  }

  async #requireActive(): Promise<OnboardingStatus> {
    const current = await this.status();
    if (current.state !== "in_progress" || !current.conversationId) {
      throw new Error("当前没有进行中的首次体验");
    }
    return current;
  }

  async #append(
    conversationId: string,
    create: (timestamp: number) => AgentMessage[],
  ): Promise<ConversationDetail> {
    const messages = await this.conversations.loadMessages(conversationId);
    const lastTimestamp = messages.reduce((latest, message) =>
      Math.max(latest, typeof message.timestamp === "number" ? message.timestamp : 0), 0);
    const timestamp = Math.max(Date.now(), lastTimestamp + 1);
    return this.conversations.saveMessages(conversationId, [
      ...messages,
      ...create(timestamp),
    ]);
  }

  async #conversationOrNull(id: string): Promise<ConversationDetail | null> {
    try { return await this.conversations.get(id); } catch { return null; }
  }

  async #resetConversation(id: string): Promise<ConversationDetail> {
    await this.conversations.rename(id, "新对话");
    return this.conversations.saveMessages(id, []);
  }
}

function initialStatus(): OnboardingStatus {
  return {
    version: ONBOARDING_VERSION,
    state: "not_started",
    step: "welcome",
    conversationId: null,
    completedAt: null,
  };
}
