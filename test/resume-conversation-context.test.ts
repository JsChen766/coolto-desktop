import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type {
  ConversationDetail,
  ConversationResumeContextInput,
  ResumeDraftDetail,
  ResumeChatReference,
} from "../src/desktop/shared/types.js";

test("opening and resetting a local Resume keeps an exact persistent context", async () => {
  const draft = {
    artifactId: "draft-1",
    title: "商业分析实习生",
    conversationIds: ["older", "newer"],
    cloudResumeId: null,
  } as ResumeDraftDetail;
  const records = new Map([
    ["older", conversation("older", "2026-08-30T00:00:00.000Z")],
    ["newer", conversation("newer", "2026-08-31T00:00:00.000Z")],
  ]);
  const bound: ConversationResumeContextInput[] = [];
  const api = {
    bindResume: async (input: ConversationResumeContextInput) => {
      bound.push(input);
      const value = records.get(input.conversationId)!;
      value.activeResumeArtifactId = input.artifactId;
      return structuredClone(value);
    },
    createForResume: async (artifactId: string) => {
      const value = conversation("fresh", "2026-08-31T01:00:00.000Z");
      value.activeResumeArtifactId = artifactId;
      records.set(value.id, value);
      return structuredClone(value);
    },
    clearResumeContext: async (id: string) => structuredClone(records.get(id)!),
  };
  (globalThis as unknown as { window: unknown }).window = {
    coolto: { conversations: api },
  };
  const { useResumeConversationContext } = await import(
    "../src/desktop/renderer/src/app/use-resume-conversation-context.js"
  );
  const current = ref<ConversationDetail>();
  const resumeReference = ref<ResumeChatReference>();
  const controller = useResumeConversationContext({
    session: {
      authenticatedReady: ref(false),
      conversations: ref([...records.values()]),
      current,
      running: ref(false),
      runError: ref<string>(),
      createConversation: async () => undefined,
      selectConversation: async () => undefined,
      reloadConversation: async (id) => { current.value = structuredClone(records.get(id)!); },
    },
    workspace: {
      activeDraft: ref(draft),
      openDraft: async () => draft,
      refreshActive: async () => undefined,
    },
    preview: {
      resumeOperationContext: resumeReference,
      activateLocalResumeContext: (value) => {
        resumeReference.value = reference(value);
      },
      clearResumeOperationContext: () => { resumeReference.value = undefined; },
      resetResumePreview: () => { resumeReference.value = undefined; },
    },
    activeView: ref("chat"),
    activeArtifactType: ref("resume"),
    artifactOpen: ref(false),
    closeNarrowSidebar: () => undefined,
    conversationsApi: api as never,
  });

  await controller.openResumeDraft(draft.artifactId);
  assert.deepEqual(bound, [{ conversationId: "newer", artifactId: "draft-1" }]);
  assert.equal(current.value?.id, "newer");
  assert.equal(resumeReference.value?.artifactId, "draft-1");

  controller.requestContextReset();
  await controller.confirmContextReset();
  assert.equal(current.value?.id, "fresh");
  assert.deepEqual(current.value?.messages, []);
  assert.equal(current.value?.activeResumeArtifactId, "draft-1");
  assert.equal(resumeReference.value?.artifactId, "draft-1");
});

function conversation(id: string, updatedAt: string): ConversationDetail {
  return {
    id, title: "新对话", createdAt: updatedAt, updatedAt, messageCount: 0,
    messages: [], resumeArtifacts: [], experienceImportArtifacts: [],
  };
}

function reference(draft: ResumeDraftDetail): ResumeChatReference {
  return {
    artifactId: draft.artifactId,
    targetType: "resume",
    targetId: draft.artifactId,
    label: draft.title,
    source: "local",
  };
}
