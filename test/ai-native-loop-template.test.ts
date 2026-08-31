import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { ActionExecutorRegistry } from "../src/approvals/executor-registry.js";
import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import { AgentTaskProposalService } from
  "../src/desktop/main/agent-task/agent-task-proposal-service.js";
import {
  mailScheduleLoopTemplate,
  resumeJobLoopTemplate,
} from "../src/tools/ai-native-loop-templates.js";
import { createPrepareAiNativeLoopTools } from
  "../src/tools/prepare-ai-native-loops.js";
import {
  briefingAutoStartAfter, followUpAutoStartAfter,
} from "../src/tools/ai-native-loop-schedule.js";
import {
  followUpLoopTemplate, interviewBriefingLoopTemplate,
  riskDeadlineLoopTemplate, strategyLoopTemplate,
} from "../src/tools/ai-native-extended-loop-templates.js";

const expiresAt = () => new Date(Date.now() + 60_000).toISOString();

test("extended Loop schedules derive deterministic first-run times", () => {
  const now = Date.parse("2026-09-01T00:00:00Z");
  assert.equal(followUpAutoStartAfter(24, now), "2026-09-02T00:00:00.000Z");
  assert.equal(briefingAutoStartAfter("2026-09-03T00:00:00Z", 1440, now),
    "2026-09-02T00:00:00.000Z");
  assert.throws(() => briefingAutoStartAfter(null, 60, now), /缺少有效时间/u);
});

test("resume job template freezes one Resume and the complete managed apply scope", () => {
  const input = resumeJobLoopTemplate({
    conversationId: "conversation", goal: "Find matching roles",
    resumeId: "resume-1", resumeTitle: "Backend Resume",
    resumeContentHash: "a".repeat(64),
    sources: [{ provider: "greenhouse", sourceKey: "acme", company: "Acme" }],
    applicationDomains: ["careers.acme.example"], expiresAt: expiresAt(),
  });
  assert.equal(input.assetPolicy.submissionMode, "confirm_each");
  assert.equal(input.assetPolicy.resumeContentHash, "a".repeat(64));
  assert.deepEqual(input.jobCriteria.sources, [
    { provider: "greenhouse", sourceKey: "acme", company: "Acme" },
  ]);
  assert.ok(input.allowedActions.includes("resume.read"));
  assert.ok(input.allowedActions.includes("jd.write"));
  assert.ok(input.allowedActions.includes("browser.submit"));
  assert.deepEqual(input.allowedDomains, [
    "boards-api.greenhouse.io", "boards.greenhouse.io", "careers.acme.example",
  ]);
});

test("mail schedule template freezes direction, source and local polling", () => {
  assert.throws(() => mailScheduleLoopTemplate({
    conversationId: "conversation", goal: "Track interview mail",
    directions: ["received"], browserWebmail: false,
    mailConnectionIds: [], allowedDomains: [], pollIntervalMinutes: 15,
    expiresAt: expiresAt(),
  }), /必须选择/u);
  assert.throws(() => mailScheduleLoopTemplate({
    conversationId: "conversation", goal: "Track sent mail",
    directions: ["sent"], browserWebmail: false,
    mailConnectionIds: ["gmail-1"], allowedDomains: [], pollIntervalMinutes: 15,
    expiresAt: expiresAt(),
  }), /发件识别需要 Browser Webmail/u);
  const input = mailScheduleLoopTemplate({
    conversationId: "conversation", goal: "Track interview mail",
    directions: ["received", "sent"], browserWebmail: true,
    mailConnectionIds: [], allowedDomains: ["mail.example"],
    pollIntervalMinutes: 15, expiresAt: expiresAt(),
  });
  assert.equal(input.connectorPolicy?.appSchedule, true);
  assert.deepEqual(input.connectorPolicy?.scheduleMailDirections, ["received", "sent"]);
  assert.equal(input.connectorPolicy?.pollIntervalMinutes, 15);
  assert.ok(input.allowedActions.includes("tracker.interview.update"));
});

test("extended AI Native templates freeze scopes and keep external writes gated", () => {
  const follow = followUpLoopTemplate({
    conversationId: "conversation", goal: "Follow up", applicationId: "app-1",
    allowedDomains: ["mail.example"], checkIntervalHours: 72, expiresAt: expiresAt(),
    autoStartAfter: new Date().toISOString(),
  });
  assert.equal(follow.assetPolicy.applicationId, "app-1");
  assert.ok(typeof follow.connectorPolicy?.autoStartAfter === "string");
  assert.ok(follow.allowedActions.includes("follow_up.write"));
  assert.ok(!follow.allowedActions.includes("mail.send"));
  const brief = interviewBriefingLoopTemplate({
    conversationId: "conversation", goal: "Prepare", applicationId: "app-1",
    interviewId: "interview-1", researchDomains: [], wakeBeforeMinutes: 1440,
    expiresAt: expiresAt(), autoStartAfter: new Date().toISOString(),
  });
  assert.equal(brief.connectorPolicy?.interviewId, "interview-1");
  assert.ok(typeof brief.connectorPolicy?.autoStartAfter === "string");
  assert.ok(brief.allowedActions.includes("experience.read"));
  const strategy = strategyLoopTemplate({
    conversationId: "conversation", goal: "Review", reviewIntervalDays: 7,
    expiresAt: expiresAt(),
  });
  assert.equal(strategy.answerPolicy.changes, "proposal_only");
  const risk = riskDeadlineLoopTemplate({
    conversationId: "conversation", goal: "Watch", directions: ["received"],
    browserWebmail: true, mailConnectionIds: [], allowedDomains: ["mail.example"],
    pollIntervalMinutes: 15, expiresAt: expiresAt(),
  });
  assert.equal(risk.assetPolicy.applicationScope, "mail_linked");
  assert.ok(risk.allowedActions.includes("reminder.prepare"));
  assert.ok(!risk.allowedActions.includes("tracker.application.update"));
});

test("specialized loop tool creates only an immutable approval proposal", async () => {
  const services = new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository(
      "owner", new MemoryAgentHarnessStatePersistence(),
    ),
  );
  const proposals = new AgentTaskProposalService(services);
  const executors = new ActionExecutorRegistry();
  executors.register("agent_task.provision", {
    execute: async () => ({ summary: "not executed in this test" }),
  });
  const approvals = new ApprovalManager(new ApprovalStore(), executors);
  const tool = createPrepareAiNativeLoopTools({
    conversationId: "conversation", proposals, approvals,
    resumes: { getResume: async () => ({
      id: "resume-1", title: "Backend Resume", status: "active",
      qualityStatus: "passed", contentHash: "a".repeat(64),
    }) } as never,
  }).find((item) => item.name === "prepare_resume_job_loop")!;
  const result = await tool.execute("loop", {
    goal: "Find matching roles", resumeId: "resume-1",
    resumeTitle: "Backend Resume", resumeContentHash: "a".repeat(64),
    sources: [{ provider: "lever", sourceKey: "acme", company: "Acme" }],
    applicationDomains: [], expiresAt: expiresAt(),
  });
  assert.equal((await services.tasks.list()).length, 0);
  assert.equal(approvals.listPending()[0]?.actionType, "agent_task.provision");
  assert.match(JSON.stringify(result.details), /resume_job_apply/u);
  await assert.rejects(tool.execute("stale", {
    goal: "Find matching roles", resumeId: "resume-1",
    resumeTitle: "Stale title", resumeContentHash: "a".repeat(64),
    sources: [{ provider: "lever", sourceKey: "acme", company: "Acme" }],
    applicationDomains: [], expiresAt: expiresAt(),
  }), /版本已变化/u);
});
