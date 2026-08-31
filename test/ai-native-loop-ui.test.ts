import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nextTick } from "vue";

import type {
  AgentTaskProposalView,
  DesktopApi,
  JobRepositoryResume,
  MailConnectionView,
} from "../src/desktop/shared/types.js";
import { useMailScheduleLoopDialog } from
  "../src/desktop/renderer/src/agent-tasks/use-mail-schedule-loop-dialog.js";
import { useResumeJobLoopDialog } from
  "../src/desktop/renderer/src/agent-tasks/use-resume-job-loop-dialog.js";
import { useApplicationLoopDialog } from
  "../src/desktop/renderer/src/agent-tasks/use-application-loop-dialog.js";
import { useGlobalAiLoopDialog } from
  "../src/desktop/renderer/src/agent-tasks/use-global-ai-loop-dialog.js";

test("Resume loop dialog prepares, reviews and starts one product task", async () => {
  const calls: string[] = [];
  const api = loopApi(calls);
  let started = "";
  const state = useResumeJobLoopDialog({
    api, conversationId: "conversation", resume: resumeFixture(),
    started: (taskId) => { started = taskId; },
  });
  state.form.sources[0]!.company = "Acme";
  state.form.sources[0]!.sourceKey = "acme";
  state.form.applicationDomains = "careers.acme.example";
  await state.review();
  assert.equal(state.stage.value, "review");
  assert.deepEqual(calls, ["prepare-resume"]);
  await state.start();
  assert.equal(started, "task-created");
  assert.deepEqual(calls, ["prepare-resume", "execute"]);
});

test("Mail loop dialog keeps Browser and connector sources explicit", async () => {
  const calls: string[] = [];
  const connections: MailConnectionView[] = [{
    id: "gmail-1", provider: "gmail", accountEmail: "user@example.com",
    scopes: ["gmail.readonly"], connectedAt: new Date().toISOString(),
  }];
  const state = useMailScheduleLoopDialog({
    api: loopApi(calls), conversationId: "conversation", connections,
    started: () => undefined,
  });
  state.form.allowedDomains = "mail.example";
  state.form.sent = true;
  state.toggleConnection("gmail-1", true);
  await state.review();
  assert.equal(state.stage.value, "review");
  assert.deepEqual(calls, ["prepare-mail"]);
  state.form.browserWebmail = false;
  await nextTick();
  assert.equal(state.form.sent, false);
});

test("remaining four Loop dialogs use dedicated proposal paths", async () => {
  const calls: string[] = [];
  const application = {
    id: "app-1", companyName: "Acme", roleName: "Engineer",
  } as unknown as Parameters<typeof useApplicationLoopDialog>[0]["application"];
  const follow = useApplicationLoopDialog({
    api: loopApi(calls), conversationId: "conversation", application,
    interviews: [], kind: "follow_up", started: () => undefined,
  });
  follow.form.domains = "mail.example";
  await follow.review();
  const brief = useApplicationLoopDialog({
    api: loopApi(calls), conversationId: "conversation", application,
    interviews: [{ id: "interview-1", status: "scheduled", roundNumber: 1 }] as never,
    kind: "briefing", started: () => undefined,
  });
  await brief.review();
  const strategy = useGlobalAiLoopDialog({
    api: loopApi(calls), conversationId: "conversation", connections: [],
    kind: "strategy", started: () => undefined,
  });
  await strategy.review();
  const risk = useGlobalAiLoopDialog({
    api: loopApi(calls), conversationId: "conversation", connections: [],
    kind: "risk", started: () => undefined,
  });
  risk.form.allowedDomains = "mail.example";
  await risk.review();
  assert.deepEqual(calls, ["prepare-follow", "prepare-brief", "prepare-strategy", "prepare-risk"]);
});

test("visible Loop surfaces keep one-row actions, review copy and reduced motion", async () => {
  const [resume, mail, application, automation, inspector, artifact, focus, styles] = await Promise.all([
    source("../src/desktop/renderer/src/components/JobRepositoryResumeDetail.vue"),
    source("../src/desktop/renderer/src/components/MailConnectionsSettings.vue"),
    source("../src/desktop/renderer/src/components/ApplicationDetailPanel.vue"),
    source("../src/desktop/renderer/src/components/AiNativeAutomationSettings.vue"),
    source("../src/desktop/renderer/src/agent-tasks/AgentTaskInspector.vue"),
    source("../src/desktop/renderer/src/agent-tasks/AgentTaskArtifactDetail.vue"),
    source("../src/desktop/renderer/src/agent-tasks/use-loop-dialog-focus.ts"),
    source("../src/desktop/renderer/src/styles/ai-native-loops.css"),
  ]);
  assert.match(resume, /自动找岗/u);
  assert.match(resume, /qualityStatus === "passed"/u);
  assert.match(mail, /联动 App 日程/u);
  assert.match(application, /安排跟进/u);
  assert.match(application, /准备面试/u);
  assert.match(automation, /策略复盘/u);
  assert.match(automation, /风险与截止监控/u);
  assert.match(inspector, /Loop 产物/u);
  assert.match(artifact, /evidenceQuotes/u);
  assert.match(artifact, /recommendations/u);
  assert.match(artifact, /sourceLabel/u);
  assert.match(focus, /stopPropagation/u);
  assert.match(focus, /previousFocus/u);
  assert.match(inspector, /每个岗位提交前单独确认/u);
  assert.doesNotMatch(inspector, /resumeContentHash/u);
  assert.match(styles, /prefers-reduced-motion/u);
  assert.match(styles, /loop-dialog-actions/u);
  assert.doesNotMatch(styles, /from\s*\{[^}]*opacity:\s*0/su);
});

function loopApi(calls: string[]): DesktopApi {
  const proposal = (kind: string): AgentTaskProposalView => ({
    id: `proposal-${kind}`, contentHash: "hash", minimumMatch: 80,
    dailyApplicationLimit: null, mailSendAlwaysManual: true, appOpenOnly: true,
    rawObservationRetentionDays: 7, actionReceiptRetentionDays: 90,
    createdAt: new Date().toISOString(),
    input: {
      conversationId: "conversation", goal: "goal", allowedDomains: [],
      blockedDomains: [], allowedActions: [], jobCriteria: { loopKind: kind },
      assetPolicy: {}, answerPolicy: {}, unattended: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  return { agentTasks: {
    prepareResumeJobLoop: async () => { calls.push("prepare-resume"); return proposal("resume_job_apply"); },
    prepareMailScheduleLoop: async () => { calls.push("prepare-mail"); return proposal("mail_app_schedule"); },
    prepareFollowUpLoop: async () => { calls.push("prepare-follow"); return proposal("application_follow_up"); },
    prepareInterviewBriefingLoop: async () => { calls.push("prepare-brief"); return proposal("interview_briefing"); },
    prepareStrategyLoop: async () => { calls.push("prepare-strategy"); return proposal("application_strategy"); },
    prepareRiskDeadlineLoop: async () => { calls.push("prepare-risk"); return proposal("risk_deadline_watch"); },
    executeProposal: async () => { calls.push("execute"); return {
      task: { id: "task-created" },
    } as never; },
  } } as unknown as DesktopApi;
}

function resumeFixture(): JobRepositoryResume {
  return {
    resumeId: "resume-1",
    entry: {
      entryId: "cloud:resume-1", displayTitle: "Backend Resume",
      cloud: { resumeId: "resume-1", title: "Backend Resume", targetRole: "Backend",
        jdId: null, status: "active", qualityStatus: "passed",
        contentHash: "a".repeat(64), updatedAt: new Date().toISOString() },
      local: null, syncStatus: "cloud_only", availableOperations: ["open"],
    },
  } as JobRepositoryResume;
}

function source(relative: string): Promise<string> {
  return readFile(new URL(relative, import.meta.url), "utf8");
}
