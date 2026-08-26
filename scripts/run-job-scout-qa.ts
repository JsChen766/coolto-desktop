import assert from "node:assert/strict";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { JobScoutController } from "../src/job-scout/job-scout-controller.js";

const ownerId = "job-scout-qa";
const services = new AgentHarnessServices(
  ownerId,
  new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
);
const task = await services.tasks.create("conversation-qa", "Verify public ATS sources");
const now = Date.now();
await services.grants.create({
  ownerId, taskId: task.id, taskGoalHash: task.goalHash,
  allowedDomains: [
    "boards-api.greenhouse.io", "job-boards.greenhouse.io",
    "api.lever.co", "jobs.lever.co",
  ],
  blockedDomains: [],
  allowedActions: ["jobs.search", "jobs.evaluate", "task.lifecycle"],
  jobCriteria: { sources: [
    { provider: "greenhouse", sourceKey: "greenhouse", company: "Greenhouse" },
    { provider: "lever", sourceKey: "leverdemo", company: "Lever Demo" },
  ] }, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
  unattended: true, validFrom: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be3-qa",
  confirmedByUserAt: new Date(now).toISOString(),
});
await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
const controller = new JobScoutController("conversation-qa", services);

const sources = [
  { provider: "greenhouse" as const, key: "greenhouse", company: "Greenhouse" },
  { provider: "lever" as const, key: "leverdemo", company: "Lever Demo" },
];
const report: Array<Record<string, unknown>> = [];
for (const source of sources) {
  await controller.fetch({
    provider: source.provider, sourceKey: source.key, company: source.company,
  });
  const firstIngest = (await services.leads.list(task.id))
    .filter((lead) => lead.source === source.provider && lead.sourceKey === source.key);
  assert.ok(firstIngest.length > 0, `${source.provider} returned no published jobs`);
  await controller.fetch({
    provider: source.provider, sourceKey: source.key, company: source.company,
  });
  const secondIngest = (await services.leads.list(task.id))
    .filter((lead) => lead.source === source.provider && lead.sourceKey === source.key);
  assert.equal(
    new Set(secondIngest.map((lead) => lead.id)).size,
    secondIngest.length,
    `${source.provider} created duplicate lead ids`,
  );
  assert.ok(
    secondIngest.every((lead) => lead.state !== "new"),
    `${source.provider} recreated an existing lead on the second fetch`,
  );
  assert.equal(firstIngest.length, secondIngest.length);
  report.push({
    provider: source.provider,
    sourceKey: source.key,
    firstCount: firstIngest.length,
    secondCount: secondIngest.length,
    duplicateIds: 0,
    secondFetchStates: [...new Set(secondIngest.map((lead) => lead.state))],
    sampleRole: secondIngest[0]?.role,
    sampleUrl: secondIngest[0]?.targetUrl,
  });
}

process.stdout.write(`${JSON.stringify({ passed: sources.length, report }, null, 2)}\n`);
