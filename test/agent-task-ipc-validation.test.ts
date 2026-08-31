import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAgentTaskDelegationInput,
  parseAgentTaskId,
  parseMailScheduleLoopInput,
  parseResumeJobLoopInput,
} from "../src/desktop/main/agent-task/agent-task-ipc.js";
import {
  parseBriefingLoopInput, parseFollowUpLoopInput,
  parseRiskLoopInput, parseStrategyLoopInput,
} from "../src/desktop/main/agent-task/extended-loop-ipc.js";

const valid = {
  conversationId: "conversation-1",
  goal: "Find matching roles",
  allowedDomains: ["jobs.example"],
  blockedDomains: [],
  allowedActions: ["browser.read", "task.lifecycle"],
  jobCriteria: { minimumMatch: 80 },
  assetPolicy: {},
  answerPolicy: {},
  unattended: true,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

test("AgentTask IPC accepts only the confirmed delegation surface", () => {
  assert.deepEqual(parseAgentTaskDelegationInput(valid), valid);
  assert.equal(parseAgentTaskId(" task-1 "), "task-1");
  assert.throws(
    () => parseAgentTaskDelegationInput({ ...valid, serverWorkflow: "auto_apply" }),
    /不支持字段/u,
  );
});

test("AI Native Loop IPC accepts only typed product inputs", () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  assert.equal(parseResumeJobLoopInput({
    conversationId: "conversation", goal: "Find roles", resumeId: "resume-1",
    sources: [{ provider: "lever", sourceKey: "acme", company: "Acme" }],
    applicationDomains: ["jobs.lever.co"], expiresAt,
  }).sources[0]?.provider, "lever");
  assert.deepEqual(parseMailScheduleLoopInput({
    conversationId: "conversation", goal: "Track mail",
    directions: ["received", "sent"], browserWebmail: true,
    mailConnectionIds: [], allowedDomains: ["mail.example"],
    pollIntervalMinutes: 15, expiresAt,
  }).directions, ["received", "sent"]);
  assert.throws(() => parseResumeJobLoopInput({
    conversationId: "conversation", goal: "Find roles", resumeId: "resume-1",
    sources: [{ provider: "unknown", sourceKey: "x", company: "Acme" }],
    applicationDomains: [], expiresAt,
  }), /provider/u);
  assert.throws(() => parseMailScheduleLoopInput({
    conversationId: "conversation", goal: "Track mail",
    directions: ["received"], browserWebmail: true,
    mailConnectionIds: [], allowedDomains: ["mail.example"],
    pollIntervalMinutes: 1, expiresAt,
  }), /5–1440/u);
});

test("extended Loop IPC rejects widened or malformed runtime scope", () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  assert.equal(parseFollowUpLoopInput({
    conversationId: "conversation", goal: "Follow", applicationId: "app-1",
    allowedDomains: ["mail.example"], checkIntervalHours: 24, expiresAt,
  }).applicationId, "app-1");
  assert.equal(parseBriefingLoopInput({
    conversationId: "conversation", goal: "Brief", applicationId: "app-1",
    interviewId: "interview-1", researchDomains: [], wakeBeforeMinutes: 1440,
    expiresAt,
  }).interviewId, "interview-1");
  assert.equal(parseStrategyLoopInput({
    conversationId: "conversation", goal: "Review", reviewIntervalDays: 7, expiresAt,
  }).reviewIntervalDays, 7);
  assert.deepEqual(parseRiskLoopInput({
    conversationId: "conversation", goal: "Watch", directions: ["received"],
    browserWebmail: true, mailConnectionIds: [], allowedDomains: ["mail.example"],
    pollIntervalMinutes: 15, expiresAt,
  }).directions, ["received"]);
  assert.throws(() => parseStrategyLoopInput({
    conversationId: "conversation", goal: "Review", reviewIntervalDays: 0, expiresAt,
  }), /1–90/u);
  assert.throws(() => parseRiskLoopInput({
    conversationId: "conversation", goal: "Watch", directions: ["deleted"],
    browserWebmail: true, mailConnectionIds: [], allowedDomains: ["mail.example"],
    pollIntervalMinutes: 15, expiresAt,
  }), /received\/sent/u);
});

test("AgentTask IPC rejects malformed collections and oversized payloads", () => {
  assert.throws(
    () => parseAgentTaskDelegationInput({ ...valid, allowedDomains: "jobs.example" }),
    /字符串数组/u,
  );
  assert.throws(
    () => parseAgentTaskDelegationInput({ ...valid, unattended: "yes" }),
    /boolean/u,
  );
  assert.throws(
    () => parseAgentTaskDelegationInput({
      ...valid,
      jobCriteria: { text: "x".repeat(60_000) },
    }),
    /过大/u,
  );
});
