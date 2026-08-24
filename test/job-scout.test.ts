import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import type { JobSourceListing } from "../src/agent-task/browser-lead-types.js";
import { fetchGreenhouseJobs } from "../src/job-scout/greenhouse-job-source.js";
import { fetchLeverJobs } from "../src/job-scout/lever-job-source.js";
import { JobScoutController } from "../src/job-scout/job-scout-controller.js";
import { TaskLifecycleController } from "../src/agent-task/task-lifecycle-controller.js";

const response = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("Greenhouse and Lever public adapters normalize published jobs", async () => {
  const greenhouse = await fetchGreenhouseJobs("example", "Acme", async () =>
    response({ jobs: [{
      id: 42, title: "Backend Engineer", location: { name: "Hong Kong" },
      content: "<p>Build &amp; scale APIs</p>",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/42",
      updated_at: "2026-08-23T00:00:00Z",
    }] }),
  );
  assert.equal(greenhouse.listings[0]?.description, "Build & scale APIs");

  const lever = await fetchLeverJobs("example", "Beta", async () =>
    response([{ id: "job-1", text: "Platform Engineer",
      hostedUrl: "https://jobs.lever.co/beta/job-1",
      descriptionPlain: "Build platforms", workplaceType: "hybrid",
      categories: { location: "Hong Kong" }, createdAt: 1_787_472_000_000 }]),
  );
  assert.equal(lever.listings[0]?.workplaceType, "hybrid");
  assert.equal(lever.listings[0]?.location, "Hong Kong");
});

test("BrowserLead ingest is idempotent, change-aware and closes missing posts", async () => {
  const { services, task, run } = await setup();
  const listing = job("job-1", "Backend Engineer");
  let leads = await services.leads.ingest({
    taskId: task.id, source: "lever", sourceKey: "acme",
    company: "Acme", listings: [listing],
  });
  assert.equal(leads[0]?.state, "new");
  const firstId = leads[0]!.id;
  leads = await services.leads.ingest({
    taskId: task.id, source: "lever", sourceKey: "acme",
    company: "Acme", listings: [listing],
  });
  assert.equal(leads[0]?.id, firstId);
  assert.equal(leads[0]?.state, "unchanged");
  leads = await services.leads.ingest({
    taskId: task.id, source: "lever", sourceKey: "acme",
    company: "Acme", listings: [{ ...listing, role: "Senior Backend Engineer" }],
  });
  assert.equal(leads[0]?.state, "changed");
  await services.leads.ingest({
    taskId: task.id, source: "lever", sourceKey: "acme",
    company: "Acme", listings: [],
  });
  assert.equal((await services.leads.list(task.id, true))[0]?.state, "closed");
  await assert.rejects(
    services.leads.evaluate({
      taskId: task.id, runId: run.id, leadId: firstId,
      score: 79, shortlisted: true, rationale: "Too low",
    }),
    /已关闭|80%/u,
  );
});

test("Agent can shortlist only an open lead scoring at least 80", async () => {
  const { services, task, run } = await setup();
  const lead = (await services.leads.ingest({
    taskId: task.id, source: "greenhouse", sourceKey: "acme",
    company: "Acme", listings: [job("42", "Backend Engineer")],
  }))[0]!;
  const lifecycle = new TaskLifecycleController("conversation", services);
  await assert.rejects(
    lifecycle.complete({ partial: false, summary: "done" }),
    /尚未记录匹配分/u,
  );
  await assert.rejects(
    services.leads.evaluate({
      taskId: task.id, runId: run.id, leadId: lead.id,
      score: 79, shortlisted: true, rationale: "Below threshold",
    }), /80%/u,
  );
  const evaluation = await services.leads.evaluate({
    taskId: task.id, runId: run.id, leadId: lead.id,
    score: 80, shortlisted: true, rationale: "Matches required backend stack",
    evidenceRefs: ["evidence-1"],
  });
  assert.equal(evaluation.shortlisted, true);
  assert.equal((await services.leads.latestEvaluations(task.id))[0]?.id, evaluation.id);
  assert.equal((await lifecycle.complete({ partial: false, summary: "done" })).status, "completed");
});

test("Job Scout controller refuses source keys absent from immutable grant", async () => {
  const { services } = await setup();
  const controller = new JobScoutController("conversation", services);
  await assert.rejects(
    controller.fetch({
      provider: "lever", sourceKey: "ungranted", company: "Unknown",
    }),
    /jobCriteria.sources|未授权/u,
  );
});

function job(externalId: string, role: string): JobSourceListing {
  return {
    externalId, company: "Acme", role, location: "Hong Kong",
    workplaceType: "hybrid", description: "Build services",
    targetUrl: `https://jobs.example/${externalId}`, sourceUpdatedAt: null,
  };
}

async function setup() {
  const ownerId = "owner";
  const services = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await services.tasks.create("conversation", "Find roles");
  const now = Date.now();
  await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["jobs.search", "jobs.evaluate", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be3",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  const run = await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  return { services, task, run };
}
