import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import {
  continueUntilTerminal,
  isContinuable,
} from "../src/desktop/main/resume-continuation.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";

class FakeAgent {
  public prompts: string[] = [];
  public modelCallCount = 0;
  public messagesOverride: AgentMessage[] = [];
  public async prompt(input: string): Promise<void> {
    this.prompts.push(input);
    this.modelCallCount += 1;
  }
  public cancel(): void {
    // no-op for the fake
  }
  public get isRunning(): boolean {
    return false;
  }
  public getMessages(): AgentMessage[] {
    return structuredClone(this.messagesOverride);
  }
}

test("continuable statuses exclude terminal outcomes", () => {
  assert.equal(isContinuable("writing"), true);
  assert.equal(isContinuable("needs_revision"), true);
  assert.equal(isContinuable("layout_qualified"), false);
  assert.equal(isContinuable("ready_for_approval"), false);
  assert.equal(isContinuable("needs_user_decision"), false);
});

test("continuation injects diagnostics only; host never fills content", async () => {
  const { store, compiler } = await createWritingWorkspace();
  const agent = new FakeAgent();
  const fills: Array<{ itemId: string; bulletText: string }> = [];
  await continueUntilTerminal(
    agent,
    store,
    compiler,
    { maxMs: 60_000, maxModelCalls: 2 },
    { onHostFill: (hostFills) => void fills.push(...hostFills) },
  );
  assert.equal(fills.length, 0, "host must not fill content deterministically");
  assert.equal(agent.prompts.length, 2, "diagnostics are injected each round");
  for (const prompt of agent.prompts) {
    assert.match(prompt, /coolto_internal_continuation/);
  }
  const workspace = store.latest()!;
  assert.equal(
    workspace.status,
    "needs_user_decision",
    "budget exhaustion normalizes to a user decision",
  );
});

test("continueUntilTerminal respects the model-call budget when host fill cannot finish", async () => {
  const { builder, store, compiler, patcher, prepared } =
    await createWritingWorkspace();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const quotes = [
    "使用 Python 清洗运营数据产品。",
    "为 3 个团队建立周度报表。",
    "设计异常检查规则并与业务团队协作。",
  ];
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      ...quotes.map((quote, index) => ({
        op: "add_bullet" as const,
        itemId: "item-work-1",
        binding: createBinding(snapshot, `q-${index}`, quote),
      })),
      {
        op: "add_bullet" as const,
        itemId: "item-edu-1",
        binding: {
          bulletText: "主修信息系统与数据分析。",
          evidenceIds: ["edu-1:0:12"],
        },
      },
    ],
  });
  const agent = new FakeAgent();
  const logs: string[] = [];
  await continueUntilTerminal(
    agent,
    store,
    compiler,
    { maxMs: 60_000, maxModelCalls: 3 },
    { log: (line) => void logs.push(line) },
  );
  assert.equal(agent.prompts.length, 3);
  assert.ok(logs.includes("continuation:calls:3"), logs.join(","));
  for (const prompt of agent.prompts) {
    assert.match(prompt, /coolto_internal_continuation/);
  }
  const workspace = store.latest()!;
  assert.equal(
    workspace.status,
    "needs_user_decision",
    "budget exhaustion normalizes to a user decision",
  );
});

test("continueUntilTerminal stops early once the workspace turns terminal", async () => {
  const { store, workspace, compiler } = await createWritingWorkspace();
  const terminal = {
    ...structuredClone(workspace),
    status: "ready_for_approval",
  } as typeof workspace;
  const switching = new SwitchingAgent(store, terminal);
  await continueUntilTerminal(
    switching,
    store,
    compiler,
    { maxMs: 60_000, maxModelCalls: 30 },
  );
  assert.ok(switching.prompts.length <= 1);
});

test("continueUntilTerminal respects a terminal start state", async () => {
  const { store, workspace, compiler } = await createWritingWorkspace();
  const terminalStore = new ResumeWorkspaceStore();
  terminalStore.create({
    ...structuredClone(workspace),
    status: "ready_for_approval",
  });
  const idleAgent = new FakeAgent();
  await continueUntilTerminal(
    idleAgent,
    terminalStore,
    compiler,
    { maxMs: 60_000, maxModelCalls: 30 },
  );
  assert.equal(idleAgent.prompts.length, 0);
});

test("continueUntilTerminal stops on a user cancel without touching the workspace", async () => {
  // The stop button aborts the current model call, but the run settles
  // silently; without the cancel check the loop would immediately re-prompt.
  // On cancel the loop must stop AND leave the draft as the user left it.
  const { store, workspace, compiler } = await createWritingWorkspace();
  const agent = new FakeAgent();
  const logs: string[] = [];
  await continueUntilTerminal(
    agent,
    store,
    compiler,
    { maxMs: 60_000, maxModelCalls: 30 },
    {
      log: (line) => void logs.push(line),
      isCancelled: () => true,
    },
  );
  assert.equal(agent.prompts.length, 0, "no continuation round after cancel");
  assert.ok(logs.includes("continuation:cancelled"), logs.join(","));
  const latest = store.latest()!;
  assert.equal(latest.status, "writing", "cancel must not normalize the draft");
  assert.equal(latest.revision, workspace.revision);
});

class SwitchingAgent {
  public prompts: string[] = [];
  public modelCallCount = 0;
  public constructor(
    private readonly store: ResumeWorkspaceStore,
    private readonly terminal: object,
  ) {}

  public async prompt(input: string): Promise<void> {
    this.prompts.push(input);
    this.modelCallCount += 1;
    this.store.restore(structuredClone(this.terminal) as never);
  }
  public cancel(): void {
    // no-op for the fake
  }
  public get isRunning(): boolean {
    return false;
  }
  public getMessages(): AgentMessage[] {
    return [];
  }
}

async function createWritingWorkspace() {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "continuation-test",
  });
  const patcher = new ResumeCandidatePatcher(compiler, store);
  const prepared = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
  });
  return { builder, store, workspace: prepared, compiler, patcher, prepared };
}

test("continueUntilTerminal stops when model output repeats identically", async () => {
  // temperature-0 repeat loop: identical reasoning + tool calls every round,
  // workspace digest keeps changing (repeated patches) so the no-progress
  // guard misses it; the identical-output guard must terminate instead.
  const { store, compiler } = await createWritingWorkspace();
  const agent = new FakeAgent();
  agent.messagesOverride = [
    {
      role: "assistant",
      content: [{ type: "text", text: "让我为尾行违规 bullet 补充细节" }],
      api: "openai",
      provider: "openai",
      model: "deepseek-v4-flash",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 1000,
    },
  ];
  const logs: string[] = [];
  await continueUntilTerminal(
    agent,
    store,
    compiler,
    { maxMs: 60_000, maxModelCalls: 30 },
    { log: (line) => void logs.push(line) },
  );
  assert.ok(
    logs.some((line) => line.startsWith("continuation:identical-output")),
    logs.join(","),
  );
  assert.equal(agent.prompts.length, 5, "baseline round + 4 identical rounds");
  assert.equal(store.latest()!.status, "needs_user_decision");
});

test("continueUntilTerminal stops when progress metrics stall despite content changes", async () => {
  // The model keeps patching (digest changes) but the达标 metrics (usage
  // zone/pct, tail violations) stay identical - meaningless progress.
  const { store, compiler } = await createWritingWorkspace();
  const agent = new FakeAgent();
  const logs: string[] = [];
  await continueUntilTerminal(
    agent,
    store,
    compiler,
    { maxMs: 60_000, maxModelCalls: 30 },
    { log: (line) => void logs.push(line) },
  );
  assert.ok(logs.includes("continuation:stalled"), logs.join(","));
  assert.equal(store.latest()!.status, "needs_user_decision");
});
