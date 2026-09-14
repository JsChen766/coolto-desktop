import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  contextForManagedTask,
  toolsForConversationRun,
} from "../src/desktop/main/agent-task/conversation-tool-scope.js";
import { sanitizeAgentPromptInput } from "../src/desktop/main/agent-prompt-input.js";

const browserScope = {
  capabilityProfile: "browser_enhance" as const,
  allowedActions: ["browser.read", "task.lifecycle"],
};

const tool = (name: string): AgentTool => ({
  name, label: name, description: name,
  parameters: { type: "object", properties: {} },
  execute: async () => ({ content: [], details: {} }),
});

test("ordinary conversations start from safe local discovery", () => {
  const tools = [tool("search_experiences"), tool("get_preferences"), tool("resolve_preferences"),
    tool("prepare_profile_update"), tool("browser_snapshot"), tool("fetch_inbox_events"),
    tool("list_mail_connections"), tool("search_application_candidates"), tool("fetch_job_source"),
    tool("sync_now"), tool("task_wait")];
  assert.deepEqual(toolsForConversationRun(tools, false).map((item) => item.name), [
    "search_experiences", "get_preferences", "resolve_preferences", "prepare_profile_update",
  ]);
  assert.deepEqual(toolsForConversationRun(tools, false, "browser").map((item) => item.name), [
    "browser_snapshot",
  ]);
});

test("Profile maintenance exposes only Profile and Preference read/prepare tools", () => {
  const tools = [tool("get_current_user"), tool("get_user_profile"), tool("prepare_profile_update"),
    tool("get_preferences"), tool("resolve_preferences"), tool("prepare_preference_change"),
    tool("search_experiences"), tool("create_resume_workspace"), tool("browser_snapshot")];
  assert.deepEqual(toolsForConversationRun(tools, false, "profile").map((item) => item.name), [
    "get_current_user", "get_user_profile", "prepare_profile_update", "get_preferences", "resolve_preferences",
  ]);
  assert.deepEqual(toolsForConversationRun(tools, false, "preference").map((item) => item.name), [
    "get_user_profile", "get_preferences", "resolve_preferences", "prepare_preference_change",
  ]);
});

test("running AgentTasks keep only lifecycle tools when capability metadata is absent", () => {
  const tools = [tool("search_experiences"), tool("task_need_user"), tool("prepare_agent_task"),
    tool("prepare_resume_job_loop"), tool("prepare_mail_schedule_loop"), tool("request_write_access")];
  assert.deepEqual(toolsForConversationRun(tools, browserScope).map((item) => item.name), [
    "task_need_user",
  ]);
});

test("managed scope filters by real grant actions and never leaks cross-domain tools by default", () => {
  const capability = (name: string, scopes: string[]): AgentTool & {
    capability: { requiredScopes: string[] };
  } => ({
    ...tool(name), capability: { requiredScopes: scopes },
  });
  const tools = [capability("browser_snapshot", ["browser.read"]),
    capability("get_preferences", ["preference.read"]), capability("search_experiences", ["experience.read"]),
    capability("task_checkpoint", ["task.lifecycle"]), capability("task_complete", ["task.lifecycle"]),
    capability("prepare_agent_task", ["task.lifecycle"])];
  assert.deepEqual(toolsForConversationRun(tools, browserScope).map((item) => item.name), [
    "browser_snapshot", "task_checkpoint", "task_complete",
  ]);
  assert.deepEqual(toolsForConversationRun(tools, browserScope, "profile").map((item) => item.name), ["task_checkpoint", "task_complete"]);
  assert.deepEqual(toolsForConversationRun(tools, true).map((item) => item.name), []);
});

test("managed scope keeps explicitly granted lifecycle and drops bootstrap tools", () => {
  const capability = (name: string, scopes: string[]): AgentTool & {
    capability: { requiredScopes: string[] };
  } => ({ ...tool(name), capability: { requiredScopes: scopes } });
  const tools = [
    capability("task_checkpoint", ["task.lifecycle"]),
    capability("task_wait", ["task.lifecycle"]),
    capability("request_write_access", ["browser.request_access"]),
    capability("prepare_agent_task", ["app.tool.prepare_agent_task"]),
  ];
  assert.equal(contextForManagedTask("browser_enhance"), "browser");
  assert.deepEqual(toolsForConversationRun(tools, browserScope).map((item) => item.name), [
    "task_checkpoint", "task_wait",
  ]);
});

test("every renderer context hint is inert at the IPC prompt boundary", () => {
  const hints = ["discovery", "profile", "preference", "resume", "browser"] as const;
  const dangerous = [
    "browser_snapshot", "list_mail_connections", "search_application_candidates",
    "fetch_job_source", "prepare_agent_task", "task_checkpoint",
  ];
  for (const contextHint of hints) {
    const input = {
      conversationId: "conversation-1",
      text: "hello",
      contextHint,
    } as Parameters<typeof sanitizeAgentPromptInput>[0] & { contextHint: string };
    const sanitized = sanitizeAgentPromptInput(input);
    assert.equal("contextHint" in sanitized, false, contextHint);
    assert.deepEqual(
      toolsForConversationRun(dangerous.map(tool), false).map((item) => item.name),
      [],
      contextHint,
    );
  }
  const lifecycle = toolsForConversationRun([
    Object.assign(tool("task_checkpoint"), { capability: { requiredScopes: ["task.lifecycle"] } }),
  ], browserScope);
  assert.deepEqual(lifecycle.map((item) => item.name), ["task_checkpoint"]);
});

test("IPC sanitizes prompt input and runtime never reads renderer context authority", async () => {
  const [ipc, runtime] = await Promise.all([
    readFile(new URL("../src/desktop/main/conversation-agent-ipc.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/main/agent-runtime.ts", import.meta.url), "utf8"),
  ]);
  assert.match(ipc, /current\.agent\.prompt\(sanitizeAgentPromptInput\(input\)\)/u);
  assert.doesNotMatch(runtime, /input\.contextHint/u);
});
