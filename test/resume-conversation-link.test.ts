import assert from "node:assert/strict";
import test from "node:test";

import { ResumeConversationLinkService } from
  "../src/desktop/main/resume-drafts/resume-conversation-link-service.js";
import type { ConversationDetail } from
  "../src/desktop/shared/types/conversations.js";
import type { LocalResumeDraft } from "../src/resume/draft/types.js";

test("linking a ResumeDraft activates it in both local directions", async () => {
  const conversations = new MemoryConversations();
  const drafts = new MemoryDrafts();
  const service = new ResumeConversationLinkService(conversations, drafts);
  const conversation = await conversations.create();

  const linked = await service.link(conversation.id, "draft-1");
  await service.link(conversation.id, "draft-1");

  assert.equal(linked.activeResumeArtifactId, "draft-1");
  assert.deepEqual(drafts.draft.conversationIds, [conversation.id]);
  assert.equal(drafts.linkCalls, 2, "retries remain safe and idempotent");
});

test("clearing chat context creates a blank linked conversation and preserves the old one", async () => {
  const conversations = new MemoryConversations();
  const drafts = new MemoryDrafts();
  const service = new ResumeConversationLinkService(conversations, drafts);
  const old = await conversations.create();
  conversations.values.get(old.id)!.messages.push({
    id: "message-1", role: "user", content: "旧上下文",
    createdAt: "2026-08-31T00:00:00.000Z",
  });

  const fresh = await service.create("draft-1");

  assert.notEqual(fresh.id, old.id);
  assert.deepEqual(fresh.messages, []);
  assert.equal(fresh.activeResumeArtifactId, "draft-1");
  assert.equal((await conversations.get(old.id)).messages.length, 1);
  assert.deepEqual(drafts.draft.conversationIds, [fresh.id]);
});

class MemoryConversations {
  readonly values = new Map<string, ConversationDetail>();
  async create(): Promise<ConversationDetail> {
    const timestamp = "2026-08-31T00:00:00.000Z";
    const value: ConversationDetail = {
      id: `conversation-${this.values.size + 1}`,
      title: "新对话",
      createdAt: timestamp,
      updatedAt: timestamp,
      messageCount: 0,
      messages: [],
      resumeArtifacts: [],
      experienceImportArtifacts: [],
    };
    this.values.set(value.id, value);
    return structuredClone(value);
  }
  async get(id: string): Promise<ConversationDetail> {
    const value = this.values.get(id);
    if (!value) throw new Error("对话不存在");
    return structuredClone(value);
  }
  async setActiveResumeArtifact(
    id: string,
    artifactId: string | undefined,
  ): Promise<ConversationDetail> {
    const value = this.values.get(id);
    if (!value) throw new Error("对话不存在");
    if (artifactId) value.activeResumeArtifactId = artifactId;
    else delete value.activeResumeArtifactId;
    return structuredClone(value);
  }
}

class MemoryDrafts {
  linkCalls = 0;
  draft = {
    artifactId: "draft-1",
    conversationIds: [],
  } as unknown as LocalResumeDraft;
  async linkConversation(
    artifactId: string,
    conversationId: string,
  ): Promise<LocalResumeDraft> {
    this.linkCalls += 1;
    assert.equal(artifactId, this.draft.artifactId);
    if (!this.draft.conversationIds.includes(conversationId)) {
      this.draft.conversationIds.push(conversationId);
    }
    return structuredClone(this.draft);
  }
}
