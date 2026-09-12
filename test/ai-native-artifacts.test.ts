import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { AiNativeLoopService } from
  "../src/desktop/main/agent-task/ai-native-loop-service.js";
import type { ApplicationRecord } from "../src/tracker/types.js";
import { readAgentTaskDetail } from
  "../src/desktop/main/agent-task/agent-task-view.js";
import type { JsonValue } from "../src/agent-task/json-types.js";

test("follow-up and briefing artifacts are task-scoped, grounded and immutable", async () => {
  const scheduleNow = Date.now();
  const firstFollowUpAt = new Date(
    scheduleNow + 24 * 3_600_000,
  ).toISOString();
  const secondFollowUpAt = new Date(
    scheduleNow + 72 * 3_600_000,
  ).toISOString();
  const expiredFollowUpAt = new Date(
    scheduleNow - 6 * 60_000,
  ).toISOString();
  const follow = await setup("application_follow_up", { applicationId: "app-1" });
  const draft = await follow.service.createFollowUp({
    applicationId: "app-1", subject: "Following up",
    body: "I am following up on the Backend Engineer application.",
    scheduledFor: firstFollowUpAt, timezone: "Asia/Hong_Kong",
  });
  assert.equal(draft.kind, "follow_up_draft");
  assert.equal(draft.scheduledFor, firstFollowUpAt);
  await assert.rejects(follow.service.createFollowUp({
    applicationId: "app-1", subject: "Following up", body: "Changed silently",
    scheduledFor: firstFollowUpAt, timezone: "Asia/Hong_Kong",
  }), /尚未达到授权检查间隔/u);
  const nextDraft = await follow.service.createFollowUp({
    applicationId: "app-1", subject: "Second follow-up", body: "Checking in again.",
    scheduledFor: secondFollowUpAt, timezone: "Asia/Hong_Kong",
  });
  assert.equal(nextDraft.kind, "follow_up_draft");
  await assert.rejects(follow.service.createFollowUp({
    applicationId: "app-1", subject: "Expired follow-up", body: "Checking in.",
    scheduledFor: expiredFollowUpAt, timezone: "Asia/Hong_Kong",
  }), /跟进计划时间无效或已经过期/u);
  await assert.rejects(follow.service.createFollowUp({
    applicationId: "app-1", subject: "Bad timezone", body: "Checking in.",
    scheduledFor: new Date(scheduleNow + 96 * 3_600_000).toISOString(),
    timezone: "Mars/Olympus",
  }), /IANA timezone/u);

  const brief = await setup("interview_briefing", {
    applicationId: "app-1", interviewId: "interview-1",
  });
  const value = await brief.service.createBrief({
    applicationId: "app-1", interviewId: "interview-1", title: "Interview brief",
    sections: [{ heading: "Role focus", content: "Prepare system design examples.",
      sourceRefs: ["jd:jd-1", "resume:resume-1", "experience:exp-1"] }],
  });
  assert.equal(value.kind, "interview_brief");
  await assert.rejects(brief.service.createBrief({
    applicationId: "app-1", interviewId: "interview-1", title: "Bad brief",
    sections: [{ heading: "Unknown", content: "Unknown", sourceRefs: ["jd:other"] }],
  }), /来源不属于/u);
});

test("Strategy Learner freezes metrics and refuses undersized data", async () => {
  const small = await setup("application_strategy", {}, 4);
  const smallMetrics = await small.service.strategyMetrics();
  await assert.rejects(small.service.createStrategy({
    snapshotHash: smallMetrics.snapshotHash, title: "Strategy", summary: "Observe results",
    recommendations: ["Keep current sources"],
  }), /至少需要 5/u);
  const ready = await setup("application_strategy", {}, 5);
  const metrics = await ready.service.strategyMetrics();
  assert.equal(metrics.sources[0]?.key, "jobs.example");
  assert.equal(metrics.resumeVersions[0]?.total, 5);
  assert.equal(metrics.cadenceByWeek[0]?.applications, 5);
  assert.match(metrics.limitations[0] ?? "", /match score/u);
  assert.ok(Date.parse(metrics.nextReviewAt) > Date.now());
  const proposal = await ready.service.createStrategy({
    snapshotHash: metrics.snapshotHash, title: "Personal application strategy",
    summary: "Interview-stage outcomes remain limited.",
    recommendations: ["Review role mix before changing search sources"],
  });
  assert.equal(proposal.kind, "strategy_proposal");
  assert.match(proposal.caveat, /不代表因果/u);
});

test("risk notice copies only grounded mail evidence", async () => {
  const value = await setup("risk_deadline_watch", { applicationScope: "mail_linked" }, 1, {
    connectorPolicy: { riskMailDirections: ["received"] },
  });
  const event = await value.harness.events.enqueue({
    taskId: value.taskId, source: "mail", type: "mail.message_received",
    trust: "external_untrusted", occurredAt: "2026-09-01T00:00:00Z",
    dedupeKey: "risk-mail", payloadRef: null, payloadHash: "risk-mail",
  });
  const signal = await value.harness.signals.record({
    taskId: value.taskId, eventId: event.id, provider: "gmail",
    connectionId: "gmail-1", sourceMessageId: "message-1",
    sourceMessageHash: "hash", direction: "received", sender: "jobs@example.com",
    subject: "Complete assessment", receivedAt: "2026-09-01T00:00:00Z",
    kind: "deadline", confidence: 98, applicationId: "app-1",
    rationale: "Explicit deadline", evidenceQuotes: ["Complete by Friday"],
  });
  const notice = await value.service.createRiskNotice({
    signalId: signal.id, severity: "review", title: "Assessment deadline",
    rationale: "Review the requested assessment before Friday.",
    deadlineAt: "2026-09-04T09:00:00Z",
  });
  assert.equal(notice.kind, "risk_notice");
  if (notice.kind !== "risk_notice") throw new Error("unexpected artifact kind");
  assert.deepEqual(notice.evidenceQuotes, ["Complete by Friday"]);
  assert.equal(notice.applicationId, "app-1");
  const detail = await readAgentTaskDetail(value.harness, value.taskId);
  const projected = detail.artifacts.find((item) => item.id === notice.id);
  assert.equal(projected?.kind, "risk_notice");
  if (projected?.kind === "risk_notice") {
    assert.deepEqual(projected.detail.evidenceQuotes, ["Complete by Friday"]);
  }

  const sentEvent = await value.harness.events.enqueue({
    taskId: value.taskId, source: "mail", type: "mail.message_sent",
    trust: "external_untrusted", occurredAt: "2026-09-01T01:00:00Z",
    dedupeKey: "sent-risk-mail", payloadRef: null, payloadHash: "sent-risk-mail",
  });
  const sent = await value.harness.signals.record({
    taskId: value.taskId, eventId: sentEvent.id, provider: "browser_webmail",
    connectionId: "browser:https://mail.example", sourceMessageId: "message-2",
    sourceMessageHash: "hash-2", direction: "sent", sender: "user@example.com",
    subject: "Deadline", receivedAt: "2026-09-01T01:00:00Z",
    kind: "deadline", confidence: 90, applicationId: "app-1",
    rationale: "Deadline", evidenceQuotes: ["Deadline Friday"],
  });
  await assert.rejects(value.service.createRiskNotice({
    signalId: sent.id, severity: "review", title: "Sent deadline",
    rationale: "Review",
  }), /不在当前 DelegationGrant 范围/u);
});

test("briefing accepts only authorized HTTPS research sources", async () => {
  const value = await setup("interview_briefing", {
    applicationId: "app-1", interviewId: "interview-1",
  }, 1, { allowedDomains: ["research.example"], extraActions: ["browser.read"] });
  const brief = await value.service.createBrief({
    applicationId: "app-1", interviewId: "interview-1", title: "Research brief",
    sections: [{ heading: "Company", content: "Public company update",
      sourceRefs: ["web:https://research.example/company"] }],
  });
  assert.equal(brief.kind, "interview_brief");
  await assert.rejects(value.service.createBrief({
    applicationId: "app-1", interviewId: "interview-1", title: "Bad research",
    sections: [{ heading: "Company", content: "Unknown",
      sourceRefs: ["web:https://outside.example/company"] }],
  }), /授权站点/u);
});

async function setup(
  loopKind: string,
  assetPolicy: Record<string, string>,
  applicationCount = 1,
  options: {
    connectorPolicy?: Record<string, JsonValue>;
    allowedDomains?: string[];
    extraActions?: string[];
  } = {},
) {
  const harness = new AgentHarnessServices(
    "owner", new AgentHarnessStateRepository(
      "owner", new MemoryAgentHarnessStatePersistence(),
    ),
  );
  const task = await harness.tasks.create("conversation", loopKind);
  const now = Date.now();
  await harness.grants.create({
    ownerId: "owner", taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: options.allowedDomains ?? [], blockedDomains: [],
    allowedActions: ["application.loop.read", "follow_up.write", "briefing.write",
      "strategy.read", "strategy.write", "risk.write", "reminder.prepare",
      ...(options.extraActions ?? [])],
    jobCriteria: { loopKind }, assetPolicy, answerPolicy: {},
    connectorPolicy: options.connectorPolicy ?? {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be7",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const applications = Array.from({ length: applicationCount }, (_, index) =>
    application(index ? `app-${index + 1}` : "app-1", index));
  const service = new AiNativeLoopService(
    "conversation", harness,
    { getApplication: async (id: string) => applications.find((item) => item.id === id)!,
      listApplications: async () => ({ items: applications, nextCursor: null }) } as never,
    { get: async () => ({ id: "interview-1", applicationId: "app-1",
      status: "scheduled", entityVersion: 1 }) } as never,
    { getJd: async () => ({ id: "jd-1", title: "Backend Engineer",
      company: "Acme", targetRole: "Backend Engineer", requirements: [] }) } as never,
    { getResume: async () => ({ id: "resume-1", title: "Resume",
      targetRole: "Backend", contentHash: "a".repeat(64) }) } as never,
    { getExperience: async () => ({ id: "exp-1" }) } as never,
    { prepareCreate: async () => ({ id: "reminder-proposal" }),
      execute: async () => ({ id: "reminder-1", applicationId: "app-1",
        remindAt: "2026-09-01T00:00:00Z" }) } as never,
  );
  return { harness, service, taskId: task.id };
}

function application(id: string, index: number): ApplicationRecord {
  return {
    id, jdId: "jd-1", resumeId: "resume-1", companyName: "Acme",
    roleName: "Backend Engineer", jdTitleSnapshot: "Backend Engineer",
    resumeTitleSnapshot: "Resume", resumeContentHashSnapshot: "a".repeat(64),
    deliveryMethod: "form_fill", targetUrl: "https://jobs.example", appliedAt: null,
    status: index % 3 === 0 ? "interviewing" : "applied", pendingConfirmation: false,
    source: "browser", dedupeKey: id, companyBusiness: null, roleSummary: null,
    companyCulture: null, rejectionReason: null, entityVersion: 1,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    deletedAt: null, syncStatus: "clean",
  };
}
