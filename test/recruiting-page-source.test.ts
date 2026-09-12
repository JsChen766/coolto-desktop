import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRecruitingObservationCurrent,
  isRecruitingCapabilityAvailable,
  observeRecruitingPage,
} from "../src/job-scout/recruiting-page-source.js";
import { AgentHarnessServices } from
  "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { JobScoutController } from "../src/job-scout/job-scout-controller.js";
import { createJobScoutTools } from "../src/tools/job-scout-tools.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import { ManagedTaskPolicyHooks } from "../src/agent-task/managed-task-policy-hooks.js";
import { isBrowserSitePolicyAllowed } from "../src/browser/site-policy-registry.js";
import { applyToolCapabilities, requireToolCapability } from "../src/tools/tool-capabilities.js";
import { createToolRegistry } from "../src/tools/registry.js";

const origin = "https://jobsdb-hk.test";

function page() {
  return {
    url: `${origin}/jobs/platform-engineer/apply`,
    title: "Apply for Platform Engineer",
    metaDescription: "",
    ogTitle: "",
    ogDescription: "",
    text: "Apply with your resume",
    textTruncated: false,
    formFields: [{
      label: "Resume", name: "resume", inputType: "file",
      placeholder: "", required: true,
    }],
  };
}

test("page source adapts Browser observations without trusting page instructions", () => {
  const result = observeRecruitingPage({
    page: page(),
    accessibility: [{
      role: "textbox", name: "Resume", value: "", description: "", disabled: false,
    }],
    headings: ["Application form"],
    landmarks: ["main"],
    frameShadowSummary: { sameOriginFrames: 1, crossOriginFrames: 0, openShadowRoots: 1 },
  });
  assert.equal(result.trust, "external_untrusted");
  assert.equal(result.observation.origin, origin);
  assert.equal(result.recognition.siteId, "jobsdb_hk");
  assert.equal(result.recognition.surfaceKind, "application_form");
  assert.ok(result.recognition.observationHash);
  assert.equal(isRecruitingCapabilityAvailable(
    result, "read", result.recognition.observationHash,
  ), true);
  assert.equal(isRecruitingCapabilityAvailable(
    result, "fill", result.recognition.observationHash,
  ), false);
  assert.deepEqual(result.observation.formSummaries, [{
    label: "Resume", name: "resume", inputType: "file",
    placeholder: "", required: true,
  }]);
  assert.doesNotThrow(() => assertRecruitingObservationCurrent(
    result, result.recognition.observationHash,
  ));
});

test("cross-origin frames downgrade application writes to takeover", () => {
  const result = observeRecruitingPage({
    page: page(),
    frameShadowSummary: { sameOriginFrames: 0, crossOriginFrames: 1, openShadowRoots: 0 },
  });
  assert.equal(result.recognition.surfaceKind, "application_form");
  assert.deepEqual(result.recognition.capabilities, [
    "read", "match", "takeover_required",
    "final_submit_confirmation_required",
  ]);
  assert.equal(isRecruitingCapabilityAvailable(
    result, "fill", result.recognition.observationHash,
  ), false);
});

test("page source rejects stale observations before a write", () => {
  const result = observeRecruitingPage({
    page: page(), observationHash: "observation-a",
  });
  assert.throws(
    () => assertRecruitingObservationCurrent(result, "observation-b"),
    /重新观察/u,
  );
});

test("Job Scout keeps API sources separate from recruiting page sources", () => {
  const controller = new JobScoutController("conversation", new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository("owner", new MemoryAgentHarnessStatePersistence()),
  ));
  const result = controller.recognizeRecruitingPage({ page: page() });
  assert.equal(result.recognition.siteId, "jobsdb_hk");
  const fetchTool = createJobScoutTools(controller)
    .find((tool) => tool.name === "fetch_job_source");
  assert.ok(fetchTool);
  assert.match(String(fetchTool.description), /Greenhouse.*Lever/u);
  assert.match(String(fetchTool.description), /候选招聘页面/u);
});

test("ToolRegistry exposes host-owned recruiting recognition", async () => {
  const observedPage = page();
  const calls: boolean[] = [];
  const browser = {
    snapshot: async (includeScreenshot: boolean) => {
      calls.push(includeScreenshot);
      return {
        tab: {
          id: "tab-1", title: observedPage.title, url: observedPage.url,
          isActive: true, isLoading: false, canGoBack: false, canGoForward: false,
        },
        page: observedPage, accessibility: [], accessibilityTruncated: false,
      };
    },
  } as unknown as BrowserAgentController;
  const controller = new JobScoutController("conversation", new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository("owner", new MemoryAgentHarnessStatePersistence()),
  ));
  const tool = createToolRegistry({
    jobScout: controller, browserAgentController: browser,
  }).find((candidate) => candidate.name === "recognize_recruiting_page");
  assert.ok(tool);
  const schema = tool.parameters as {
    properties?: Record<string, unknown>;
  };
  assert.deepEqual(schema.properties, {});
  const result = await tool.execute("recognition", {
    url: "https://attacker.test", origin: "https://attacker.test",
    observationHash: "attacker-hash",
  } as never);
  const details = result.details as {
    status: string; operationMode: string; siteId: string; capabilities: string[];
    observationHash: string | null; trust: string;
  };
  assert.equal(details.trust, "external_untrusted");
  assert.equal(typeof details.observationHash, "string");
  assert.match(JSON.stringify(result.content), /external_untrusted/u);
  assert.deepEqual(calls, [false]);
  assert.deepEqual({
    status: details.status, operationMode: details.operationMode,
    siteId: details.siteId, capabilities: details.capabilities,
  }, {
    status: "candidate", operationMode: "takeover",
    siteId: "jobsdb_hk", capabilities: ["read", "match"],
  });
  assert.doesNotMatch(JSON.stringify(result.details), /attacker\.test|attacker-hash/u);
});

test("managed recognition is read-only and does not grant fill or submit", async () => {
  const ownerId = "owner";
  const conversationId = "conversation";
  const services = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(
      ownerId, new MemoryAgentHarnessStatePersistence(),
    ),
  );
  const task = await services.tasks.create(conversationId, "Recognize recruiting page");
  const now = Date.now();
  await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobsdb-hk.test"], blockedDomains: [],
    allowedActions: ["browser.read", "jobs.evaluate", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "test",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const observedPage = page();
  const tab = {
    id: "tab-1", title: observedPage.title, url: observedPage.url,
    isActive: true, isLoading: false, canGoBack: false, canGoForward: false,
  };
  const browser = {
    getActiveTab: () => tab,
    snapshot: async (includeScreenshot: boolean) => {
      assert.equal(includeScreenshot, false);
      return {
        tab, page: observedPage, accessibility: [], accessibilityTruncated: false,
      };
    },
  } as unknown as BrowserAgentController;
  const controller = new JobScoutController(conversationId, services);
  const recognition = createToolRegistry({
    jobScout: controller, browserAgentController: browser,
  }).find((tool) => tool.name === "recognize_recruiting_page")!;
  const capability = requireToolCapability(recognition);
  assert.deepEqual(capability.requiredScopes, ["browser.read", "jobs.evaluate"]);
  assert.equal(capability.sideEffect, "read");
  assert.equal(capability.risk, "R0");
  assert.equal(capability.evidence, "none");
  assert.equal(capability.requiresFreshObservation, false);
  assert.equal(capability.unattendedAllowed, true);
  const fake = (name: string) => ({
    name, label: name, description: name, parameters: {} as never,
    execute: async () => ({ content: [], details: {} }),
  });
  const [fill, submit] = applyToolCapabilities([
    fake("browser_fill_field"), fake("browser_submit"),
  ]);
  const hooks = new ManagedTaskPolicyHooks({
    conversationId, services, browser,
    tools: [recognition, fill!, submit!],
    sitePolicyAllows: (origin, name) => isBrowserSitePolicyAllowed(origin, name),
  });
  const before = (name: string, id: string) => {
    const toolCall = { type: "toolCall" as const, name, id, arguments: {} };
    return hooks.beforeToolCall({
      toolCall, args: {}, assistantMessage: { content: [toolCall] } as never,
      context: {} as never,
    });
  };
  assert.equal(await before(recognition.name, "recognize"), undefined);
  const result = await recognition.execute("recognize", {
    url: "https://attacker.test", observationHash: "attacker-hash",
  } as never);
  await hooks.afterToolCall({
    toolCall: { type: "toolCall", name: recognition.name, id: "recognize", arguments: {} },
    args: {}, assistantMessage: {} as never, context: {} as never,
    result, isError: false,
  });
  const details = result.details;
  assert.ok(details && typeof details === "object" && "siteId" in details);
  assert.equal(details.siteId, "jobsdb_hk");
  assert.match((await before(fill!.name, "fill"))?.reason ?? "", /site_policy_blocked/u);
  assert.match((await before(submit!.name, "submit"))?.reason ?? "", /site_policy_blocked/u);
});
