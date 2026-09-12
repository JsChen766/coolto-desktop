import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage, BeforeToolCallContext } from
  "@earendil-works/pi-agent-core";
import { compactResumeGenerationContext } from "../src/agent/context-policy.js";
import { createRepetitionGuard } from "../src/agent/repetition-guard.js";
import { executeAgentPrompt } from
  "../src/desktop/main/agent-runtime-prompt.js";
import type { ConversationAgentContext } from
  "../src/desktop/main/agent-runtime-context.js";
import {
  createResumeReadLedger,
  resumeRecoveryDecision,
} from "../src/resume/workspace/recovery-contract.js";
import { restoreLatestInProgressResume } from
  "../src/desktop/main/resume-drafts/resume-conversation-restorer.js";
import { resumeContinuationDecision } from
  "../src/desktop/main/resume-continuation.js";
import type { ResumeWorkspace } from
  "../src/resume/workspace/types.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";

test("stale workspace recovery requires a fresh reread", async () => {
  const workspace = structuredClone((await createReadySaveFixture()).ready);
  const decision = resumeRecoveryDecision({
    workspace,
    expectedRevision: workspace.revision - 1,
    expectedSourceFingerprint: "stale-source",
  });

  assert.equal(decision.action, "reread_current_state");
  assert.equal(decision.continueAutomatically, false);
  assert.match(decision.reason, /revision|source/u);
  assert.equal(decision.revision, workspace.revision);
});

test("one fact asset can be read once per user turn and again after reset", () => {
  const ledger = createResumeReadLedger();

  assert.equal(ledger.claim("experience", "exp-1"), true);
  assert.equal(ledger.claim("experience", "exp-1"), false);
  assert.equal(ledger.claim("jd", "jd-1"), true);

  ledger.reset();
  assert.equal(ledger.claim("experience", "exp-1"), true);
});

test("runtime recovery treats a terminal guard stop as a completed turn", async () => {
  const workspace = structuredClone((await createReadySaveFixture()).ready);
  const context = fakeContext(workspace, "same_tool_sequence", "same_tool_sequence");
  const result = await executeAgentPrompt({
    prompt: { text: "继续生成" } as never,
    context,
    resumeDrafts: {} as never,
    pendingAttachments: [],
  });

  assert.equal(result.messages.length, 1);
});

test("runtime recovery does not swallow a real model error", async () => {
  const workspace = structuredClone((await createReadySaveFixture()).ready);
  const context = fakeContext(workspace, "402: insufficient_credits", undefined);

  await assert.rejects(
    executeAgentPrompt({
      prompt: { text: "继续生成" } as never,
      context,
      resumeDrafts: {} as never,
      pendingAttachments: [],
    }),
    /402: insufficient_credits/u,
  );
});

test("the continuation adapter classifies a terminal workspace before recovery", async () => {
  const workspace = structuredClone((await createReadySaveFixture()).ready);
  const decision = resumeContinuationDecision({ workspace });

  assert.equal(decision.action, "stop");
  assert.equal(decision.continueAutomatically, false);
});

test("referenced draft recovery keeps an un-drifted reference recoverable", async () => {
  const current = structuredClone((await createReadySaveFixture()).ready);
  const restored = structuredClone(current);
  let promptCalls = 0;
  const context = fakeContext(
    current,
    undefined,
    undefined,
    true,
    () => { promptCalls += 1; },
  );
  context.sourceBuilder = {
    build: async () => restored.sourceSnapshot,
  } as never;

  await executeAgentPrompt({
    prompt: {
      text: "继续修改这份简历",
      resumeReference: {
        source: "local",
        artifactId: "artifact-current",
        label: "当前简历",
      },
    } as never,
    context,
    resumeDrafts: {
      get: async () => ({
        artifactId: "artifact-current",
        workspace: restored,
      }),
    } as never,
    pendingAttachments: [],
  });

  assert.equal(context.workspaceStore.latest()?.revision, restored.revision);
  assert.equal(
    context.workspaceStore.latest()?.sourceSnapshot.sourceFingerprint,
    restored.sourceSnapshot.sourceFingerprint,
  );
  assert.equal(promptCalls, 1);
});

test("referenced draft activation rejects each memory freshness drift before prompting", async () => {
  const cases = [
    {
      name: "revision",
      mutate: (workspace: ResumeWorkspace) => { workspace.revision += 1; },
    },
    {
      name: "source fingerprint",
      mutate: (workspace: ResumeWorkspace) => {
        workspace.sourceSnapshot = {
          ...workspace.sourceSnapshot,
          sourceFingerprint: "persisted-source",
        };
      },
    },
  ];

  for (const scenario of cases) {
    const memory = structuredClone((await createReadySaveFixture()).ready);
    const persisted = structuredClone(memory);
    scenario.mutate(persisted);
    let promptCalls = 0;
    const context = fakeContext(
      memory,
      undefined,
      undefined,
      true,
      () => { promptCalls += 1; },
    );
    context.sourceBuilder = {
      build: async () => persisted.sourceSnapshot,
    } as never;
    const safeRevision = context.workspaceStore.latest()?.revision;
    const safeSource = context.workspaceStore.latest()
      ?.sourceSnapshot.sourceFingerprint;

    await assert.rejects(
      executeAgentPrompt({
        prompt: {
          text: "继续修改这份简历",
          resumeReference: {
            source: "local",
            artifactId: `artifact-memory-drift-${scenario.name}`,
            label: "旧草稿",
          },
        } as never,
        context,
        resumeDrafts: {
          get: async () => ({
            artifactId: `artifact-memory-drift-${scenario.name}`,
            workspace: persisted,
          }),
        } as never,
        pendingAttachments: [],
      }),
      /重新读取|revision|source/u,
    );
    assert.equal(promptCalls, 0, scenario.name);
    assert.equal(context.workspaceStore.latest()?.revision, safeRevision);
    assert.equal(
      context.workspaceStore.latest()?.sourceSnapshot.sourceFingerprint,
      safeSource,
    );
  }
});

test("referenced draft activation rejects source drift after restart refusal", async () => {
  const persisted = structuredClone((await createReadySaveFixture()).ready);
  persisted.sourceSnapshot = {
    ...persisted.sourceSnapshot,
    sourceFingerprint: "persisted-source",
  };
  let promptCalls = 0;
  const context = fakeContext(
    persisted,
    undefined,
    undefined,
    false,
    () => { promptCalls += 1; },
  );
  context.sourceBuilder = {
    build: async () => ({
      ...persisted.sourceSnapshot,
      sourceFingerprint: "current-source",
    }),
  } as never;
  const draftReader = {
    get: async () => ({
      artifactId: "artifact-stale-source",
      workspace: persisted,
    }),
  };
  const autoRestored = await restoreLatestInProgressResume(
    [{
      artifactId: "artifact-stale-source",
      checkpointId: null,
      title: "旧草稿",
      createdAt: "2026-09-08T00:00:00Z",
      workspaceStatus: "needs_user_decision",
    }] as never,
    draftReader,
    context,
  );
  assert.equal(autoRestored, false);


  await assert.rejects(
    executeAgentPrompt({
      prompt: {
        text: "继续修改这份简历",
        resumeReference: {
          source: "local",
          artifactId: "artifact-stale-source",
          label: "旧草稿",
        },
      } as never,
      context,
      resumeDrafts: draftReader as never,
      pendingAttachments: [],
    }),
    /重新读取|漂移/u,
  );
  assert.equal(promptCalls, 0);
  assert.equal(context.workspaceStore.latest(), undefined);
});

test("referenced draft activation rejects reused cloud Resume drift", async () => {
  const persisted = structuredClone((await createReadySaveFixture()).ready);
  persisted.reuseBase = {
    kind: "cloud",
    resumeId: "resume-base",
    sourceJdId: "jd-1",
    contentHash: "persisted-resume",
    retainedBulletCount: 1,
    droppedBulletCount: 0,
  };
  let promptCalls = 0;
  const context = fakeContext(
    persisted,
    undefined,
    undefined,
    false,
    () => { promptCalls += 1; },
  );
  context.sourceBuilder = {
    build: async () => persisted.sourceSnapshot,
  } as never;
  context.resumeReader = {
    getResume: async () => ({ contentHash: "current-resume" }),
  } as never;

  await assert.rejects(
    executeAgentPrompt({
      prompt: {
        text: "继续修改这份简历",
        resumeReference: {
          source: "local",
          artifactId: "artifact-stale-resume",
          label: "旧草稿",
        },
      } as never,
      context,
      resumeDrafts: {
        get: async () => ({
          artifactId: "artifact-stale-resume",
          workspace: persisted,
        }),
      } as never,
      pendingAttachments: [],
    }),
    /重新读取|漂移/u,
  );
  assert.equal(promptCalls, 0);
  assert.equal(context.workspaceStore.latest(), undefined);
});

test("the runtime read guard scopes repeats to one operation and user turn", async () => {
  const guard = createRepetitionGuard();
  const first = await guard(beforeToolCall("get_jd", { jdId: "jd-1" }, 1));
  const related = await guard(beforeToolCall(
    "find_resume_reuse_candidates", { targetJdId: "jd-1" }, 1,
  ));
  const repeated = await guard(beforeToolCall("get_jd", { jdId: "jd-1" }, 1));
  const nextTurn = await guard(beforeToolCall("get_jd", { jdId: "jd-1" }, 2));

  assert.equal(first, undefined);
  assert.equal(related, undefined);
  assert.equal(repeated?.block, true);
  assert.equal(nextTurn, undefined);
});

test("the runtime read guard blocks a repeated Resume read", async () => {
  const guard = createRepetitionGuard();
  const first = await guard(beforeToolCall(
    "get_resume", { artifactId: "resume-1" }, 1,
  ));
  const repeated = await guard(beforeToolCall(
    "get_resume", { artifactId: "resume-1" }, 1,
  ));

  assert.equal(first, undefined);
  assert.equal(repeated?.block, true);
});

test("transient first reads can retry once, then successful duplicates are blocked", async () => {
  const cases = [
    ["get_jd", { jdId: "jd-1" }],
    ["get_experience", { experienceId: "exp-1" }],
    ["get_resume", { artifactId: "resume-1" }],
  ] as const;

  for (const [name, args] of cases) {
    const guard = createRepetitionGuard();
    const first = await guard(beforeToolCall(name, args, 1, 1));
    const retry = await guard(beforeToolCall(
      name,
      args,
      2,
      1,
      [readResult(name, "call-1", 2, true, "temporary network timeout")],
    ));
    const duplicate = await guard(beforeToolCall(
      name,
      args,
      3,
      1,
      [
        readResult(name, "call-1", 2, true, "temporary network timeout"),
        readResult(name, "call-2", 3, false, "success"),
      ],
    ));

    assert.equal(first, undefined, name);
    assert.equal(retry, undefined, `${name} should retry after a transient failure`);
    assert.equal(duplicate?.block, true, `${name} duplicate should be blocked`);
  }
});

test("context compaction keeps fresh discovery after an earlier resume phase", async () => {
  const messages: AgentMessage[] = [
    { role: "user", content: "上一轮生成", timestamp: 1 } as AgentMessage,
    toolResult("apply_resume_content", "old", 2, {
      nextAction: { mode: "write_item_lines" },
    }),
    { role: "user", content: "换一个岗位", timestamp: 3 } as AgentMessage,
    toolResult("search_experiences", "fresh", 4),
  ];

  const compacted = await compactResumeGenerationContext(messages);

  assert.equal(compacted.some((message) =>
    message.role === "toolResult" &&
    message.toolCallId === "fresh"
  ), true);
});
function toolResult(
  toolName: string,
  toolCallId: string,
  timestamp: number,
  details?: Record<string, unknown>,
): AgentMessage {
  return {
    role: "toolResult",
    toolName,
    toolCallId,
    content: [{ type: "text", text: "{}" }],
    isError: false,
    timestamp,
    ...(details ? { details } : {}),
  } as AgentMessage;
}


function fakeContext(
  workspace: ResumeWorkspace,
  runStopError: string | undefined,
  runGuardStopReason: "same_tool_sequence" | undefined,
  restoreWorkspace = true,
  onPrompt?: () => void,
): ConversationAgentContext {
  const workspaceStore = new ResumeWorkspaceStore();
  if (restoreWorkspace) workspaceStore.restore(workspace);
  let messages: AgentMessage[] = [
    { role: "user", content: "继续生成", timestamp: 1 } as AgentMessage,
  ];
  const agent = {
    prompt: async () => { onPrompt?.(); },
    runStopError,
    runGuardStopReason,
    getMessages: () => messages,
    replaceMessages: (next: AgentMessage[]) => { messages = next; },
  } as unknown as ConversationAgentContext["agent"];
  return {
    agent,
    workspaceStore,
    artifactIdByCandidate: new Map(),
    currentUserMessage: { timestamp: 1, text: "继续生成" },
  } as unknown as ConversationAgentContext;
}

function beforeToolCall(
  name: string,
  args: Record<string, unknown>,
  callTimestamp: number,
  userTimestamp = callTimestamp,
  priorResults: AgentMessage[] = [],
): BeforeToolCallContext {
  return {
    toolCall: { id: `call-${callTimestamp}`, name, arguments: args },
    args,
    context: {
      messages: [
        { role: "user", content: "生成", timestamp: userTimestamp },
        ...priorResults,
      ],
      tools: [],
      systemPrompt: "",
    },
  } as unknown as BeforeToolCallContext;
}

function readResult(
  toolName: string,
  toolCallId: string,
  timestamp: number,
  isError: boolean,
  text: string,
): AgentMessage {
  return {
    role: "toolResult",
    toolName,
    toolCallId,
    content: [{ type: "text", text }],
    isError,
    timestamp,
  } as AgentMessage;
}
