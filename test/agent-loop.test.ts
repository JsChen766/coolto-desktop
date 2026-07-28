import assert from "node:assert/strict";
import test from "node:test";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import type { CooltoAgentEvent } from "../src/agent/events.js";
import { createToolRegistry } from "../src/tools/registry.js";

test("single agent completes a model-selected tool loop", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("get_runtime_info", {}, { id: "tool-call-1" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("当前运行的是单一的本地 Pi Agent。"),
  ]);

  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent(
    {
      tools: createToolRegistry(),
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  agent.subscribe((event) => {
    events.push(event);
  });

  await agent.prompt("请告诉我你的运行架构");

  assert.equal(faux.state.callCount, 2);
  assert.ok(
    events.some(
      (event) =>
        event.type === "tool.started" &&
        event.name === "get_runtime_info",
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === "message.delta" &&
        event.text.length > 0,
    ),
  );
  assert.equal(events.at(-1)?.type, "run.completed");
});

test("authenticated agent can select the current-user business tool", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("get_current_user", {}, { id: "tool-call-user" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("当前登录邮箱是 alice@example.com。"),
  ]);

  const tools = createToolRegistry({
    currentUserReader: {
      getCurrentUser: async () => ({
        id: "user-1",
        email: "alice@example.com",
      }),
    },
  });
  const agent = createCooltoAgent(
    { tools },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("我现在登录的是哪个账号？");

  assert.equal(faux.state.callCount, 2);
  assert.equal(
    agent.toolNames.includes("get_current_user"),
    true,
  );
});

test("agent transcript can be exported and restored for another conversation", async () => {
  const firstFaux = fauxProvider({ tokensPerSecond: 0 });
  firstFaux.setResponses([fauxAssistantMessage("第一轮回答")]);
  const firstAgent = createCooltoAgent(
    { tools: [] },
    {
      model: firstFaux.getModel(),
      streamFn: firstFaux.provider.streamSimple.bind(firstFaux.provider),
    },
  );
  await firstAgent.prompt("第一轮问题");
  const savedMessages = firstAgent.getMessages();

  const secondFaux = fauxProvider({ tokensPerSecond: 0 });
  secondFaux.setResponses([fauxAssistantMessage("第二轮回答")]);
  const restoredAgent = createCooltoAgent(
    { tools: [] },
    {
      model: secondFaux.getModel(),
      streamFn: secondFaux.provider.streamSimple.bind(secondFaux.provider),
    },
  );
  restoredAgent.replaceMessages(savedMessages);
  await restoredAgent.prompt("第二轮问题");

  assert.equal(restoredAgent.getMessages().length, 4);
  assert.equal(savedMessages.length, 2);
});

test("agent can search experiences and then fetch the selected detail", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall(
        "search_experiences",
        { q: "agent", category: "project", limit: 5 },
        { id: "tool-call-search" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall(
        "get_experience",
        { experienceId: "exp-1" },
        { id: "tool-call-detail" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("你有一个名为 Local Agent 的项目经历。"),
  ]);

  const experienceReader = {
    searchExperiences: async () => ({
      items: [
        {
          ...experienceSummary,
        },
      ],
      nextCursor: null,
    }),
    getExperience: async () => ({
      ...experienceSummary,
      currentRevision: experienceRevision,
      revisions: [experienceRevision],
    }),
  };
  const agent = createCooltoAgent(
    {
      tools: createToolRegistry({ experienceReader }),
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("找出我的 Agent 项目经历并读取详情");

  assert.equal(faux.state.callCount, 3);
  assert.equal(agent.toolNames.includes("search_experiences"), true);
  assert.equal(agent.toolNames.includes("get_experience"), true);
});

const experienceRevision = {
  id: "rev-1",
  experienceId: "exp-1",
  content: "Built a local agent.",
  source: "manual",
  revisionHash: "hash",
  factBankStatus: "completed",
  createdAt: "2026-07-01T00:00:00Z",
};

const experienceSummary = {
  id: "exp-1",
  category: "project" as const,
  title: "Local Agent",
  organization: null,
  role: "Developer",
  location: null,
  startDate: "2026-01-01",
  endDate: null,
  tags: ["typescript", "ai"],
  status: "active" as const,
  currentRevisionId: "rev-1",
  entityVersion: 1,
  deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};
