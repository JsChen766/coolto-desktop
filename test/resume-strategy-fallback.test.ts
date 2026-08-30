import assert from "node:assert/strict";
import test from "node:test";

import { tailoredResumeFallbackDecision } from
  "../src/resume/strategy/tailored-fallback.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import type { ResumeBulletProvenance } from
  "../src/resume/workspace/types.js";
import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import { ActionExecutorRegistry } from
  "../src/approvals/executor-registry.js";
import {
  createResumeStrategyChoiceExecutor,
  requestResumeStrategyChoice,
  RESUME_STRATEGY_CHOICE_ACTION,
} from "../src/resume/strategy/choice-approval.js";
import type { CooltoAgent } from "../src/agent/coolto-agent.js";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  continueAfterResumeStrategyChoice,
} from "../src/desktop/main/resume-strategy-continuation.js";
import type { AgentRuntimeEvents } from
  "../src/desktop/main/agent-runtime-events.js";
import { activateBestAvailableGeneralResume } from
  "../src/desktop/main/resume-strategy-general-selection.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import type { LocalResumeDraft } from "../src/resume/draft/types.js";
import type { ConversationAgentContext } from
  "../src/desktop/main/agent-runtime-context.js";
import type { ResumeDraftService } from
  "../src/desktop/main/resume-drafts/resume-draft-service.js";
import type { ConversationStore } from
  "../src/desktop/main/conversation-store.js";

test("a guarded tailored resume failure offers a normal business choice", async () => {
  const { ready } = await createReadySaveFixture();
  const workspace = structuredClone(ready);
  const provenance: ResumeBulletProvenance[] = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets.map((bullet, index) => ({
      bulletId: bullet.id,
      itemId: item.id,
      origin: "grounded" as const,
      evidenceIds: [`evidence-${item.id}-${index}`],
      requirementIds: [],
      confirmation: "not_required" as const,
    }))),
  );
  workspace.bulletProvenance = provenance;
  const units = provenance.map((entry, index) => {
    const workUnitId = `work-unit-${index + 1}`;
    entry.workUnitIds = [workUnitId];
    return {
      workUnitId,
      itemId: entry.itemId,
      sourceExperienceId: workspace.structure.sections
        .flatMap((section) => section.items)
        .find((item) => item.id === entry.itemId)!.source_experience_id!,
      label: `工作单元 ${index + 1}`,
      kind: "deliverable" as const,
      evidenceIds: [...entry.evidenceIds],
    };
  });
  workspace.workUnitMap = {
    version: "work-units-v1",
    sourceFingerprint: workspace.sourceSnapshot.sourceFingerprint,
    status: "ready",
    units,
  };
  workspace.compileResult.qualified = false;
  workspace.compileResult.violations = [{
    code: "page_underfilled",
    message: "页面不足 92%",
  }];

  const decision = tailoredResumeFallbackDecision(
    workspace,
    "narrative_limit",
  );

  assert.equal(decision?.mode, "choose_resume_strategy");
  assert.deepEqual(decision?.options, [
    "use_general_resume",
    "stop_application",
  ]);
  assert.match(decision?.reason ?? "", /现有经历/u);
  assert.equal(tailoredResumeFallbackDecision(
    workspace,
    "same_tool_sequence",
  )?.mode, "choose_resume_strategy");
  workspace.bulletProvenance = provenance.slice(0, -1);
  assert.equal(tailoredResumeFallbackDecision(
    workspace,
    "same_tool_sequence",
  )?.mode, "choose_resume_strategy");
  workspace.workUnitMap.status = "pending";
  assert.equal(tailoredResumeFallbackDecision(
    workspace,
    "same_tool_sequence",
  )?.mode, "choose_resume_strategy");
  delete workspace.workUnitMap;
  assert.equal(tailoredResumeFallbackDecision(
    workspace,
    "same_tool_sequence",
  )?.mode, "choose_resume_strategy");
  workspace.workUnitMap = {
    version: "work-units-v1",
    sourceFingerprint: workspace.sourceSnapshot.sourceFingerprint,
    status: "ready",
    units,
  };
  assert.equal(tailoredResumeFallbackDecision(
    workspace,
    "repeated_tool_errors",
  ), undefined);
  workspace.selectionPolicy = "user_directed";
  assert.equal(tailoredResumeFallbackDecision(
    workspace,
    "narrative_limit",
  ), undefined);
});

test("the fallback is exposed as a two-action product card", async () => {
  const { ready } = await createReadySaveFixture();
  const executors = new ActionExecutorRegistry();
  executors.register(
    RESUME_STRATEGY_CHOICE_ACTION,
    createResumeStrategyChoiceExecutor(),
  );
  const approvals = new ApprovalManager(new ApprovalStore(), executors);

  const request = await requestResumeStrategyChoice(approvals, ready, {
    mode: "choose_resume_strategy",
    options: ["use_general_resume", "stop_application"],
    reason: "现有经历无法支持可信的针对性简历",
  });

  assert.equal(request.actionType, RESUME_STRATEGY_CHOICE_ACTION);
  assert.equal(request.title, "这份岗位暂时无法生成可信的针对性简历");
  assert.match(request.description, /通用简历/u);
  assert.equal(approvals.listPending().length, 1);
});

test("using the general resume enters delivery preparation for the current JD", async () => {
  const harness = continuationHarness();
  let selectionCalls = 0;
  await continueAfterResumeStrategyChoice({
    choice: "use_general_resume",
    cancelled: false,
    agent: harness.agent,
    events: harness.events,
    conversationId: "conversation-1",
    useGeneralResume: async () => {
      selectionCalls += 1;
      return {
        artifactId: "general-1", title: "通用简历",
        targetJdId: "jd-1", generationReady: true,
      };
    },
  });
  assert.equal(selectionCalls, 1);
  assert.deepEqual(harness.prompts, []);
  assert.match(harness.notices[0] ?? "", /已切换到通用简历/u);
});

test("the host activates an existing ready general draft without writing it", async () => {
  const { ready } = await createReadySaveFixture();
  const targeted = structuredClone(ready);
  const generalWorkspace = structuredClone(ready);
  generalWorkspace.candidateId = "candidate-general";
  generalWorkspace.sourceSnapshot = {
    ...generalWorkspace.sourceSnapshot,
    generationStrategy: "general",
    jd: null,
  };
  const general = localDraft("general-1", generalWorkspace, "2026-08-30T01:00:00Z");
  const workspaceStore = new ResumeWorkspaceStore();
  workspaceStore.restore(targeted);
  const context = {
    workspaceStore,
    artifactIdByCandidate: new Map<string, string>(),
  } as ConversationAgentContext;
  const added: string[] = [];
  const shown: string[] = [];

  const selected = await activateBestAvailableGeneralResume({
    conversationId: "conversation-1",
    drafts: {
      listReusableDrafts: async () => [general],
      artifactReference: (draft: LocalResumeDraft) => ({
        artifactId: draft.artifactId,
        checkpointId: null,
        title: draft.title,
        createdAt: draft.createdAt,
      }),
    } as unknown as ResumeDraftService,
    conversations: {
      addResumeArtifact: async (_conversationId: string, artifact: { artifactId: string }) => {
        added.push(artifact.artifactId);
      },
    } as unknown as ConversationStore,
    context,
    events: {
      showDraft: (_conversationId: string, artifactId: string) => {
        shown.push(artifactId);
      },
    } as unknown as AgentRuntimeEvents,
  });

  assert.equal(selected.artifactId, "general-1");
  assert.equal(selected.generationReady, true);
  assert.equal(selected.targetJdId, targeted.sourceSnapshot.jd?.id);
  assert.equal(context.workspaceStore.latest()?.candidateId, "candidate-general");
  assert.deepEqual(added, ["general-1"]);
  assert.deepEqual(shown, ["general-1"]);
});

test("the host still switches to an unfinished general draft without generating", async () => {
  const { ready } = await createReadySaveFixture();
  const targeted = structuredClone(ready);
  const generalWorkspace = structuredClone(ready);
  generalWorkspace.candidateId = "candidate-general-unfinished";
  generalWorkspace.sourceSnapshot = {
    ...generalWorkspace.sourceSnapshot,
    generationStrategy: "general",
    jd: null,
  };
  generalWorkspace.status = "needs_revision";
  generalWorkspace.compileResult.qualified = false;
  generalWorkspace.compileResult.violations = [{
    code: "page_underfilled", message: "页面不足 92%",
  }];
  const general = localDraft(
    "general-unfinished",
    generalWorkspace,
    "2026-08-30T02:00:00Z",
  );
  const workspaceStore = new ResumeWorkspaceStore();
  workspaceStore.restore(targeted);
  const shown: string[] = [];

  const selected = await activateBestAvailableGeneralResume({
    conversationId: "conversation-1",
    drafts: {
      listReusableDrafts: async () => [general],
      artifactReference: (draft: LocalResumeDraft) => ({
        artifactId: draft.artifactId, checkpointId: null,
        title: draft.title, createdAt: draft.createdAt,
      }),
    } as unknown as ResumeDraftService,
    conversations: {
      addResumeArtifact: async () => undefined,
    } as unknown as ConversationStore,
    context: {
      workspaceStore,
      artifactIdByCandidate: new Map<string, string>(),
    } as ConversationAgentContext,
    events: {
      showDraft: (_conversationId: string, artifactId: string) => {
        shown.push(artifactId);
      },
    } as unknown as AgentRuntimeEvents,
  });

  assert.equal(selected.artifactId, "general-unfinished");
  assert.equal(selected.generationReady, false);
  assert.deepEqual(shown, ["general-unfinished"]);
});

test("stopping the application ends the strategy session without another model turn", async () => {
  const harness = continuationHarness();
  await continueAfterResumeStrategyChoice({
    choice: "stop_application",
    cancelled: false,
    agent: harness.agent,
    events: harness.events,
    conversationId: "conversation-1",
    useGeneralResume: async () => { throw new Error("must not select"); },
  });

  assert.deepEqual(harness.prompts, []);
  assert.match(harness.notices[0] ?? "", /本次会话结束/u);
});

function continuationHarness() {
  let messages: AgentMessage[] = [];
  const prompts: string[] = [];
  const notices: string[] = [];
  const agent = {
    prompt: async (text: string) => { prompts.push(text); },
    getMessages: () => structuredClone(messages),
    replaceMessages: (next: AgentMessage[]) => { messages = structuredClone(next); },
  } as unknown as CooltoAgent;
  const events = {
    emitAssistantNotice: (_conversationId: string, text: string) => {
      notices.push(text);
    },
  } as unknown as AgentRuntimeEvents;
  return {
    agent,
    events,
    prompts,
    notices,
    get messages() { return messages; },
  };
}

function localDraft(
  artifactId: string,
  workspace: Awaited<ReturnType<typeof createReadySaveFixture>>["ready"],
  updatedAt: string,
): LocalResumeDraft {
  return {
    schemaVersion: "local-resume-draft-v1",
    artifactId,
    ownerId: "user-1",
    conversationIds: ["source-conversation"],
    title: "通用简历",
    createdAt: updatedAt,
    updatedAt,
    workspace,
    checkpoints: [],
    pendingChange: null,
    cloudLink: null,
  };
}
