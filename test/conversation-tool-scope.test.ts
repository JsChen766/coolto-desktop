import assert from "node:assert/strict";
import test from "node:test";

import type { AgentTool } from "@earendil-works/pi-agent-core";

import { toolsForConversationRun } from
  "../src/desktop/main/agent-task/conversation-tool-scope.js";

const tool = (name: string): AgentTool => ({
  name,
  label: name,
  description: name,
  parameters: { type: "object", properties: {} },
  execute: async () => ({ content: [], details: {} }),
});

test("ordinary conversations cannot call AgentTask lifecycle tools", () => {
  const tools = [tool("search_experiences"), tool("prepare_agent_task"),
    tool("task_checkpoint"), tool("task_wait"), tool("task_need_user"),
    tool("task_complete")];
  assert.deepEqual(
    toolsForConversationRun(tools, false).map((item) => item.name),
    ["search_experiences", "prepare_agent_task"],
  );
});

test("running AgentTasks retain the complete tool surface", () => {
  const tools = [tool("search_experiences"), tool("task_need_user")];
  assert.deepEqual(toolsForConversationRun(tools, true), tools);
  assert.notEqual(toolsForConversationRun(tools, true), tools);
});
