import assert from "node:assert/strict";
import test from "node:test";
import type { AgentEvent } from "@earendil-works/pi-agent-core";

import {
  isResumeContactComplete,
  missingResumeContactFields,
  normalizeResumeContact,
  normalizedPhoneComparisonValue,
} from "../src/resume/contracts/profile-contact.js";
import {
  mergeSelectedResumeContactImport,
  proposeResumeContactImport,
} from "../src/resume/contracts/profile-import-contract.js";
import {
  initialCustomSectionOrder,
  reorderCustomSections,
} from "../src/resume/contracts/custom-section-order.js";
import {
  dedupeResumeSkills,
  normalizeResumeSection,
  RESUME_SECTION_ORDER,
} from "../src/resume/contracts/section-contract.js";
import {
  ResumeGenerationTraceStore,
  summarizeTrace,
} from "../src/resume/performance/generation-trace-store.js";
import {
  assertTraceExcludesValues,
  assertTraceIsMetadataOnly,
} from "../src/resume/performance/telemetry-safety.js";
import { mapPiEvent } from "../src/agent/events.js";

test("Section A contact contract preserves display phone and requires https URLs", () => {
  const contact = normalizeResumeContact({
    fullName: "  匿名候选人  ",
    phone: " +852 1234 5678 ",
    contactEmail: "candidate@example.test",
    location: "Hong Kong",
    linkedinUrl: "https://www.linkedin.com/in/example",
    githubUrl: null,
    personalWebsite: null,
  });
  assert.equal(contact.phone, "+852 1234 5678");
  assert.equal(normalizedPhoneComparisonValue(contact.phone), "+85212345678");
  assert.equal(isResumeContactComplete(contact), true);
  assert.deepEqual(missingResumeContactFields({ ...contact, phone: null }), ["phone"]);
  assert.throws(() => normalizeResumeContact({ ...contact, githubUrl: "github.com/example" }));
});

test("Section A freezes open section and skill rules without changing the current renderer", () => {
  assert.deepEqual(RESUME_SECTION_ORDER, ["education", "work", "project", "other", "skills"]);
  assert.deepEqual(
    normalizeResumeSection({ coreCategory: "other", sectionKey: " certificates ", sectionLabel: "证书" }),
    { coreCategory: "other", sectionKey: "certificates", sectionLabel: "证书" },
  );
  assert.deepEqual(dedupeResumeSkills([" TypeScript ", "typescript", "SQL"]), ["TypeScript", "SQL"]);
  assert.throws(() => normalizeResumeSection({ coreCategory: "other", sectionKey: null, sectionLabel: "证书" }));
});

test("Section A import proposal preserves existing values until explicitly selected", () => {
  const current = normalizeResumeContact({
    fullName: "匿名候选人",
    phone: "+852 1234 5678",
    contactEmail: "candidate@example.test",
    location: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsite: null,
  });
  const proposal = proposeResumeContactImport(current, {
    ...current,
    phone: "+852 8765 4321",
    location: "Hong Kong",
  });
  assert.deepEqual(proposal.map((field) => [field.field, field.selectedByDefault]), [
    ["phone", false],
    ["location", true],
  ]);
  assert.deepEqual(
    mergeSelectedResumeContactImport(current, proposal, ["location"]),
    { ...current, location: "Hong Kong" },
  );
  assert.throws(() => mergeSelectedResumeContactImport(current, proposal, ["githubUrl"]));
});

test("Section A keeps imported custom section order until one shared user reorder", () => {
  const initial = initialCustomSectionOrder([
    { sectionKey: "certificates", firstSeenOrder: 4 },
    { sectionKey: "research", firstSeenOrder: 1 },
    { sectionKey: "certificates", firstSeenOrder: 2 },
  ]);
  assert.deepEqual(initial.orderedSectionKeys, ["research", "certificates"]);
  assert.deepEqual(
    reorderCustomSections(initial, ["certificates", "research"]).orderedSectionKeys,
    ["certificates", "research"],
  );
  assert.throws(() => reorderCustomSections(initial, ["research"]));
});

test("trace records only metadata and captures complete generation timing", () => {
  let monotonic = 0;
  const traces = new ResumeGenerationTraceStore({
    now: () => new Date("2026-08-03T00:00:00.000Z"),
    monotonicNow: () => monotonic,
  });
  traces.start("run-1", "model-test");
  monotonic = 5;
  traces.recordModelStarted("run-1");
  monotonic = 10;
  traces.recordModelCompleted("run-1", "success");
  traces.recordToolStarted("run-1", "snapshot-1", "create_resume_workspace");
  monotonic = 20;
  traces.recordTool("run-1", "snapshot-1", "create_resume_workspace", "success");
  traces.recordCompile("run-1", 7, "success");
  monotonic = 25;
  traces.recordToolStarted("run-1", "patch-1", "apply_resume_content");
  monotonic = 30;
  traces.recordTool("run-1", "patch-1", "apply_resume_content", "success", {
    revision: 14,
    actionMode: "tail_repair",
    requestedTargetCount: 2,
    measuredTailCount: 6,
    appliedTailCount: 2,
    rejectedTailCount: 4,
    remainingTailCount: 7,
  });
  monotonic = 35;
  traces.recordToolStarted("run-1", "inspect-1", "get_resume_workspace");
  monotonic = 37;
  traces.recordTool("run-1", "inspect-1", "get_resume_workspace", "success");
  traces.recordDraftSaved("run-1");
  traces.recordQualifiedPreviewDelivered("run-1");
  traces.recordStopReason("run-1", "completed");
  monotonic = 40;
  const trace = traces.finish("run-1", {
    workspaceStatus: "ready_for_approval",
    failed: false,
  });
  assert.ok(trace);
  assertTraceIsMetadataOnly(trace);
  assertTraceExcludesValues(trace, ["匿名候选人", "+852 1234 5678", "candidate@example.test", "证据原文"]);
  const summary = summarizeTrace(trace);
  assert.equal(summary.elapsedMs, 40);
  assert.equal(summary.modelCallCount, 1);
  assert.equal(summary.compileCount, 1);
  assert.equal(summary.repairRoundCount, 1);
  assert.equal(summary.stopReason, "completed");
  assert.equal(summary.qualifiedPreviewDelivered, true);
  assert.equal(summary.stageDurationsMs.model_call, 5);
  assert.equal(summary.stageDurationsMs.source_snapshot, 10);
  assert.deepEqual(traces.latestForConversation("run-1"), trace);
  const patch = trace.events.find((event) => event.stage === "patch");
  assert.equal(patch?.revision, 14);
  assert.equal(patch?.rejectedTailCount, 4);
});

test("Pi model lifecycle maps to timing events without forwarding message content", () => {
  const started = mapPiEvent({
    type: "message_start",
    message: { role: "assistant", content: [] },
  } as unknown as AgentEvent);
  const completed = mapPiEvent({
    type: "message_end",
    message: { role: "assistant", content: [], stopReason: "stop" },
  } as unknown as AgentEvent);
  assert.deepEqual(started, { type: "model.started" });
  assert.deepEqual(completed, { type: "model.completed", isError: false });
  assert.equal(JSON.stringify({ started, completed }).includes("content"), false);
});

test("Pi tool failures retain a bounded diagnostic for the desktop UI", () => {
  const completed = mapPiEvent({
    type: "tool_execution_end",
    toolCallId: "call-1",
    toolName: "apply_resume_content",
    isError: true,
    result: { content: [{ text: "invalid resume patch" }] },
  } as unknown as AgentEvent);
  assert.deepEqual(completed, {
    type: "tool.completed",
    callId: "call-1",
    name: "apply_resume_content",
    isError: true,
    error: "invalid resume patch",
  });
});
