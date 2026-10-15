import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type {
  ConversationDetail,
  OnboardingStatus,
} from "../src/desktop/shared/types.js";
import {
  OnboardingService,
  type OnboardingConversationStore,
  type OnboardingStateRepository,
} from "../src/desktop/main/onboarding/onboarding-service.js";

test("all accounts without state receive one reusable onboarding conversation", async () => {
  const state = new MemoryState();
  const conversations = new MemoryConversations();
  const service = new OnboardingService(state, conversations);

  assert.equal((await service.status()).state, "not_started");
  const first = await service.start("zh-CN");
  const second = await service.start("zh-CN");

  assert.equal(first.status.state, "in_progress");
  assert.equal(first.status.step, "welcome");
  assert.equal(second.status.conversationId, first.status.conversationId);
  assert.equal(conversations.created, 1);
  assert.match(textOf(conversations.messages[0]!), /完全虚构/u);
});

test("fixed script completes once without any model dependency", async () => {
  const state = new MemoryState();
  const conversations = new MemoryConversations();
  const service = new OnboardingService(state, conversations);
  await service.start("zh-CN");

  for (const action of [
    "accept_sample_profile",
    "view_sample_experience",
    "generate_sample_resume",
    "open_browser_demo",
    "finish_browser_demo",
    "view_sample_application",
  ] as const) await service.advance(action, "zh-CN");
  const completed = await service.complete("zh-CN");

  assert.equal(completed.status.state, "completed");
  assert.equal(completed.status.step, "completed");
  assert.ok(completed.status.completedAt);
  assert.match(textOf(conversations.messages.at(-1)!), /示例数据已清理/u);
  assert.match(textOf(conversations.messages.at(-1)!), /先沉淀真实经历/u);
  await service.start("zh-CN");
  assert.equal(conversations.created, 1, "completed onboarding never restarts");
});

test("out-of-order actions fail closed and English script is deterministic", async () => {
  const state = new MemoryState();
  const conversations = new MemoryConversations();
  const service = new OnboardingService(state, conversations);
  await service.start("en-US");
  await assert.rejects(
    service.advance("generate_sample_resume", "en-US"),
    /不能执行 generate_sample_resume/u,
  );
  await service.advance("accept_sample_profile", "en-US");
  assert.match(textOf(conversations.messages.at(-1)!), /real experience library/u);
});

test("skip completes every active step and resets the guide conversation", async () => {
  const steps: OnboardingStatus["step"][] = [
    "welcome", "experience", "resume", "browser", "browser_review",
    "tracker", "complete",
  ];
  for (const step of steps) {
    const state = new MemoryState();
    const conversations = new MemoryConversations();
    const service = new OnboardingService(state, conversations);
    const started = await service.start("zh-CN");
    state.value = { ...started.status, step };
    const skipped = await service.skip();

    assert.equal(skipped.status.state, "completed", step);
    assert.equal(skipped.status.step, "completed", step);
    assert.ok(skipped.status.completedAt, step);
    assert.equal(skipped.conversation?.title, "新对话", step);
    assert.deepEqual(conversations.messages, [], step);
  }
});

test("skip before start is persistent and completed skip is idempotent", async () => {
  const state = new MemoryState();
  const conversations = new MemoryConversations();
  const service = new OnboardingService(state, conversations);

  const first = await service.skip();
  const second = await service.skip();

  assert.equal(first.status.state, "completed");
  assert.equal(first.status.conversationId, null);
  assert.deepEqual(second, first);
  assert.equal(conversations.created, 0);
});

class MemoryState implements OnboardingStateRepository {
  value: OnboardingStatus | undefined;
  async read(): Promise<OnboardingStatus | undefined> {
    return this.value ? structuredClone(this.value) : undefined;
  }
  async write(status: OnboardingStatus): Promise<void> {
    this.value = structuredClone(status);
  }
}

class MemoryConversations implements OnboardingConversationStore {
  created = 0;
  messages: AgentMessage[] = [];
  detail: ConversationDetail | undefined;
  async create(): Promise<ConversationDetail> {
    this.created += 1;
    this.detail = detail();
    return structuredClone(this.detail);
  }
  async get(): Promise<ConversationDetail> {
    if (!this.detail) throw new Error("missing");
    return structuredClone(this.detail);
  }
  async loadMessages(): Promise<AgentMessage[]> { return structuredClone(this.messages); }
  async saveMessages(_id: string, messages: AgentMessage[]): Promise<ConversationDetail> {
    this.messages = structuredClone(messages);
    if (!this.detail) throw new Error("missing");
    this.detail.messageCount = messages.length;
    return structuredClone(this.detail);
  }
  async rename(_id: string, title: string): Promise<void> {
    if (this.detail) this.detail.title = title;
  }
}

function detail(): ConversationDetail {
  const now = new Date().toISOString();
  return {
    id: "019fb000-0000-7000-8000-000000000999",
    title: "新对话", createdAt: now, updatedAt: now, messageCount: 0,
    messages: [], resumeArtifacts: [], experienceImportArtifacts: [],
  };
}

function textOf(message: AgentMessage): string {
  if (!("content" in message)) return "";
  if (typeof message.content === "string") return message.content;
  return Array.isArray(message.content)
    ? message.content.flatMap((part) =>
      part && typeof part === "object" && "text" in part
        ? [String(part.text)] : []).join("\n")
    : "";
}
