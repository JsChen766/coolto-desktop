import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeWorkspace } from
  "../src/resume/workspace/types.js";
import {
  authoritativeResumeQualitySignal,
  resolveResumeTerminalState,
  resumeTerminalInstruction,
} from "../src/resume/workspace/terminal-state.js";
import {
  deriveWorkspaceStatus,
  maxReachableUsageRatio,
} from "../src/resume/workspace/workspace-status.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";

async function readyWorkspace(): Promise<ResumeWorkspace> {
  return structuredClone((await createReadySaveFixture()).ready);
}

test("mechanical readiness is the authoritative quality signal", async () => {
  const current = await readyWorkspace();
  delete current.qualityReport;
  const passed = authoritativeResumeQualitySignal(current);
  const stale = structuredClone(current);
  stale.compileObservedRevision = current.revision - 1;

  assert.equal(passed.passed, true);
  assert.equal(passed.revision, current.revision);
  assert.equal(authoritativeResumeQualitySignal(stale).passed, false);
});

test("missing compile observation fails closed as the authoritative signal", async () => {
  const current = await readyWorkspace();
  delete current.compileObservedRevision;

  const signal = authoritativeResumeQualitySignal(current);

  assert.equal(signal.passed, false);
  assert.equal(signal.observedRevision, undefined);
  assert.ok(signal.blockerCodes.includes("layout_not_current"));
});


test("needs-user-decision is a terminal turn without hidden continuation", async () => {
  const current = await readyWorkspace();
  current.status = "needs_user_decision";
  current.compileResult = {
    ...current.compileResult,
    qualified: false,
    violations: [{ code: "page_underfilled", message: "Page is underfilled." }],
  };
  current.materialRequest = {
    kind: "page_fill_stalled",
    reason: "当前事实无法安全补齐页面",
    question: "请补充一个具体结果",
    status: "awaiting_response",
    requestedAt: "2026-09-08T00:00:00.000Z",
  };

  const state = resolveResumeTerminalState(current);

  assert.equal(state.kind, "needs_user_decision");
  assert.equal(state.continueAutomatically, false);
  assert.equal(state.revision, current.revision);
  assert.match(resumeTerminalInstruction(state), /停止工具调用/u);
  assert.doesNotMatch(resumeTerminalInstruction(state), /candidate-terminal/u);
});

test("a stale ready status cannot bypass current mechanical gates", async () => {
  const current = await readyWorkspace();
  current.status = "ready_for_approval";
  current.compileResult = {
    ...current.compileResult,
    qualified: false,
    violations: [{ code: "page_underfilled", message: "Page is underfilled." }],
  };

  const state = resolveResumeTerminalState(current);

  assert.notEqual(state.kind, "ready_for_approval");
  assert.equal(state.continueAutomatically, false);
});

test("a non-terminal workspace remains eligible for automatic continuation", async () => {
  const current = await readyWorkspace();
  current.status = "needs_revision";
  current.compileResult = {
    ...current.compileResult,
    qualified: false,
    violations: [{ code: "page_underfilled", message: "Page is underfilled." }],
  };

  const state = resolveResumeTerminalState(current);

  assert.equal(state.kind, "running");
  assert.equal(state.continueAutomatically, true);
});

test("a pending material request prevents a stale ready status", async () => {
  const current = await readyWorkspace();
  current.status = "ready_for_approval";
  current.materialRequest = {
    kind: "page_fill_stalled",
    reason: "等待用户回答",
    question: "请补充一个结果",
    status: "awaiting_response",
    requestedAt: "2026-09-08T00:00:00.000Z",
  };

  const state = resolveResumeTerminalState(current);

  assert.equal(state.kind, "needs_user_decision");
  assert.equal(state.continueAutomatically, false);
});

test("physical reachability counts only existing bullet expansion", async () => {
  const current = await readyWorkspace();
  const compile = {
    ...current.compileResult,
    usedHeightPx: 400,
    availableHeightPx: 1_000,
    usageRatio: 0.4,
    bullets: [],
  };

  assert.equal(maxReachableUsageRatio(compile), 0.4);
});

test("max-height existing bullets below 92 percent are physically unreachable", async () => {
  const current = await readyWorkspace();
  const compileResult = {
    ...current.compileResult,
    qualified: false,
    usedHeightPx: 400,
    availableHeightPx: 1_000,
    usageRatio: 0.4,
    bullets: current.compileResult.bullets.map((bullet) => ({
      ...bullet,
      lineCount: 3,
    })),
    violations: [{ code: "page_underfilled" as const, message: "Page is underfilled." }],
  };
  const sourceSnapshot = {
    ...current.sourceSnapshot,
    experiences: [],
  };

  const status = deriveWorkspaceStatus(
    compileResult,
    current.structure,
    { sourceSnapshot, bindings: [] },
  );

  assert.equal(status, "needs_user_decision");
});


test("declined material and ready workspaces have distinct terminal reasons", async () => {
  const stoppedWorkspace = await readyWorkspace();
  stoppedWorkspace.status = "needs_user_decision";
  stoppedWorkspace.compileResult = {
    ...stoppedWorkspace.compileResult,
    qualified: false,
    violations: [{ code: "page_underfilled", message: "Page is underfilled." }],
  };
  stoppedWorkspace.materialRequest = {
    kind: "page_fill_stalled",
    reason: "用户确认没有更多材料",
    question: "请补充一个具体结果",
    status: "declined",
    resolution: "user_stopped_questions",
    requestedAt: "2026-09-08T00:00:00.000Z",
  };

  const stopped = resolveResumeTerminalState(stoppedWorkspace);
  const ready = resolveResumeTerminalState(await readyWorkspace());

  assert.equal(stopped.kind, "stopped");
  assert.equal(stopped.continueAutomatically, false);
  assert.equal(ready.kind, "ready_for_approval");
  assert.equal(ready.continueAutomatically, false);
});
