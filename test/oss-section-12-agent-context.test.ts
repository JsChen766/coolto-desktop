import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import { sanitizeAgentMessagesForPersistence } from "../src/agent/persistence-policy.js";
import {
  createDefaultStagePolicy,
  stageScopes,
} from "../src/agent-task/stage-policy.js";
import { evaluateDelegationPolicy } from "../src/agent-task/delegation-policy.js";
import type { DelegationGrantV1 } from "../src/agent-task/grant-types.js";
import type { ToolCapabilityMetadataV1 } from "../src/agent-task/tool-capability-types.js";
import {
  toolsForConversationRun,
  type ConversationToolContext,
} from "../src/desktop/main/agent-task/conversation-tool-scope.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { requireToolCapability } from "../src/tools/tool-capabilities.js";

/** PRD §12: tools that must stay out of ordinary resume / discovery conversations. */
const FINAL_DELIVERY_AND_MAIL_TOOLS = [
  "prepare_application_submission",
  "browser_submit",
  "sync_submission_receipt",
  "confirm_submission_receipt",
  "list_mail_connections",
  "fetch_inbox_events",
  "capture_browser_mail_event",
  "prepare_inbox_application_update",
  "prepare_inbox_interview_update",
  "search_application_candidates",
] as const;

const RESUME_ORIENTED_TOOLS = [
  "search_experiences",
  "get_experience",
  "create_resume_workspace",
  "get_resume",
  "prepare_match_analysis",
  "list_selected_files",
  "parse_selected_file",
  "get_preferences",
] as const;

const tool = (name: string): AgentTool => ({
  name,
  label: name,
  description: name,
  parameters: { type: "object", properties: {} },
  execute: async () => ({ content: [], details: {} }),
});

const capability = (
  name: string,
  scopes: string[],
  sideEffect: ToolCapabilityMetadataV1["sideEffect"] = "read",
): AgentTool & { capability: ToolCapabilityMetadataV1 } => ({
  ...tool(name),
  capability: {
    sideEffect,
    risk: "R1",
    requiredScopes: scopes,
    concurrency: "sequential",
    idempotency: "none",
    evidence: "none",
    requiresFreshObservation: false,
    unattendedAllowed: true,
  },
});

test("§12 matrix: resume and discovery hide final delivery / mail tools", () => {
  const catalog = [
    ...RESUME_ORIENTED_TOOLS.map(tool),
    ...FINAL_DELIVERY_AND_MAIL_TOOLS.map(tool),
    tool("browser_snapshot"),
    tool("task_wait"),
    tool("prepare_agent_task"),
  ];
  for (const context of ["discovery", "resume"] as ConversationToolContext[]) {
    const visible = new Set(
      toolsForConversationRun(catalog, false, context).map((item) => item.name),
    );
    for (const name of RESUME_ORIENTED_TOOLS) {
      assert.equal(visible.has(name), true, `${context} should keep ${name}`);
    }
    for (const name of FINAL_DELIVERY_AND_MAIL_TOOLS) {
      assert.equal(visible.has(name), false, `${context} must hide ${name}`);
    }
    assert.equal(visible.has("browser_snapshot"), false);
    assert.equal(visible.has("task_wait"), false);
    assert.equal(visible.has("prepare_agent_task"), false);
  }
});

test("§12 stage switch: observe blocks write; approved_action allows granted write", () => {
  const allowedActions = ["browser.read", "browser.write", "task.lifecycle"];
  const grant: DelegationGrantV1 = {
    version: 1,
    id: "grant-1",
    ownerId: "owner",
    taskId: "task",
    taskGoalHash: "goal",
    allowedDomains: ["jobs.example"],
    blockedDomains: [],
    allowedActions,
    stagePolicy: createDefaultStagePolicy(allowedActions),
    jobCriteria: {},
    assetPolicy: {},
    answerPolicy: {},
    submissionBudget: {},
    unattended: true,
    validFrom: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    policyVersion: "stage-v1",
    confirmedByUserAt: "2026-01-01T00:00:00.000Z",
    contentHash: "grant-hash",
  };
  assert.deepEqual(stageScopes(grant, "observe"), [
    "browser.read",
    "task.lifecycle",
  ]);
  assert.ok(stageScopes(grant, "approved_action").includes("browser.write"));

  const writeMeta: ToolCapabilityMetadataV1 = {
    sideEffect: "reversible",
    risk: "R1",
    requiredScopes: ["browser.write"],
    concurrency: "sequential",
    idempotency: "request_key",
    evidence: "action_receipt",
    requiresFreshObservation: false,
    unattendedAllowed: true,
  };
  const base = {
    ownerId: "owner",
    taskId: "task",
    runId: "run",
    toolCallId: "call",
    taskGoalHash: "goal",
    requestHash: "request",
    targetOrigin: "https://jobs.example",
    metadata: writeMeta,
    grant,
    revocation: null,
    unattended: true,
    freshObservation: true,
    sitePolicyAllowed: true,
  };
  assert.equal(
    evaluateDelegationPolicy({ ...base, currentStage: "observe" }).reasonCode,
    "stage_scope_not_granted",
  );
  assert.equal(
    evaluateDelegationPolicy({
      ...base,
      currentStage: "approved_action",
      stageTransitionId: "transition-1",
    }).decision,
    "allow",
  );
});

test("§12 restart: page / file / workspace handles expire with re-read instructions", () => {
  const cases: Array<{ toolName: string; mustMatch: RegExp; mustNot: RegExp }> = [
    {
      toolName: "browser_snapshot",
      mustMatch: /Re-open the App browser|browser_snapshot again/u,
      mustNot: /stale-element-xyz|secret-page/u,
    },
    {
      toolName: "list_selected_files",
      mustMatch: /list_selected_files again|re-attach/u,
      mustNot: /file-secret-id/u,
    },
    {
      toolName: "parse_selected_file",
      mustMatch: /list_selected_files again|re-attach|stale fileId/u,
      mustNot: /file-secret-id|private attachment body/u,
    },
    {
      toolName: "create_resume_workspace",
      mustMatch: /create_resume_workspace again/u,
      mustNot: /private current revision content/u,
    },
  ];
  for (const item of cases) {
    const messages = [
      {
        role: "toolResult" as const,
        toolCallId: `${item.toolName}-call`,
        toolName: item.toolName,
        content: [{ type: "text" as const, text: "secret-page stale-element-xyz file-secret-id private attachment body private current revision content" }],
        details: {
          fileId: "file-secret-id",
          elementId: "stale-element-xyz",
          experiences: [{ content: "private current revision content" }],
        },
        isError: false,
        timestamp: 1,
      },
    ];
    const serialized = JSON.stringify(sanitizeAgentMessagesForPersistence(messages as never));
    assert.match(serialized, /expired/u, item.toolName);
    assert.match(serialized, item.mustMatch, item.toolName);
    assert.doesNotMatch(serialized, item.mustNot, item.toolName);
  }
});

test("§12 single Agent: runtime is single-agent; write executors are not model tools", async () => {
  const tools = createToolRegistry();
  const runtime = await tools[0]!.execute("runtime-call", {});
  assert.equal(runtime.details.architecture, "single-agent");
  assert.equal(runtime.details.cloudLangGraphUsed, false);

  const names = new Set(createToolRegistry({
    // empty deps → only get_runtime_info; full catalog scanned from source
  }).map((item) => item.name));
  assert.deepEqual([...names], ["get_runtime_info"]);

  const [approvalsSource, registrySource, readme] = await Promise.all([
    readFile(new URL("../src/actions/create-action-approvals.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/tools/registry.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(readme, /只有一个 Agent/u);
  assert.match(readme, /真正写入的执行器不出现在模型 Tool List/u);
  assert.match(approvalsSource, /ActionExecutorRegistry/u);
  assert.doesNotMatch(registrySource, /ActionExecutorRegistry/u);
  assert.doesNotMatch(registrySource, /createExperienceImportExecutor/u);
  assert.doesNotMatch(registrySource, /createResumeSaveExecutor/u);
  assert.doesNotMatch(registrySource, /createSubmissionApprovalExecutor/u);

  const prepareSources = [
    "../src/tools/prepare-profile-update.ts",
    "../src/tools/prepare-preference-change.ts",
    "../src/tools/import-experiences/prepare-import.ts",
    "../src/tools/prepare-jd-import.ts",
    "../src/tools/prepare-agent-task.ts",
    "../src/tools/application-submission-tools.ts",
    "../src/tools/answer-vault-tools.ts",
  ];
  for (const relative of prepareSources) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /approval|Approval/u, relative);
  }
});

test("§12 managed grant never widens into unscoped tools by default", () => {
  const tools = [
    capability("browser_snapshot", ["browser.read"]),
    capability("prepare_application_submission", ["browser.submit"], "external_commitment"),
    capability("search_experiences", ["experience.read"]),
    capability("task_checkpoint", ["task.lifecycle"]),
  ];
  const scoped = toolsForConversationRun(tools, {
    capabilityProfile: "browser_enhance",
    allowedActions: ["browser.read", "task.lifecycle"],
  });
  assert.deepEqual(scoped.map((item) => item.name), [
    "browser_snapshot",
    "task_checkpoint",
  ]);
});

test("§12 tool capability metadata is required for every registered tool", () => {
  const tools = createToolRegistry();
  for (const item of tools) {
    assert.ok(requireToolCapability(item).requiredScopes.length > 0, item.name);
  }
});
