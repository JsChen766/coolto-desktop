import assert from "node:assert/strict";
import test from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import type { CooltoAgentEvent } from "../src/agent/events.js";
import { wrapInternalPrompt } from "../src/agent/internal-prompt.js";
import { turnGovernorError } from "../src/agent/agent-errors.js";
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

test("agent queues one automatic follow-up after a text-only planning turn", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage("我先计划下一步工具参数"),
    fauxAssistantMessage("工具链已继续并完成"),
  ]);
  let queued = false;
  const agent = createCooltoAgent(
    {
      tools: [],
      automaticFollowUp: () => {
        if (queued) return undefined;
        queued = true;
        return "立即继续执行";
      },
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("生成简历");

  assert.equal(faux.state.callCount, 2);
  const transcript = JSON.stringify(agent.getMessages());
  assert.match(transcript, /coolto_resume_generation_follow_up/u);
  assert.match(transcript, /工具链已继续并完成/u);
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
          currentRevision: experienceRevision,
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
  const searchResult = agent
    .getMessages()
    .find(
      (message) =>
        message.role === "toolResult" && message.toolName === "search_experiences",
    );
  assert.ok(searchResult && "content" in searchResult);
  const projectedSearch = JSON.stringify(searchResult.content);
  assert.match(projectedSearch, /Built a local agent/);
  assert.doesNotMatch(projectedSearch, /revisionHash|entityVersion|syncStatus/);
});

test("read-only tool calls in one assistant turn execute concurrently", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("read_a", {}), fauxToolCall("read_b", {})],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("读取完成"),
  ]);
  let active = 0;
  let peak = 0;
  const readTool = (name: string): AgentTool => ({
    name,
    label: name,
    description: "Read-only concurrency probe",
    parameters: Type.Object({}),
    execute: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { content: [{ type: "text", text: name }], details: null };
    },
  });
  const agent = createCooltoAgent(
    { tools: [readTool("read_a"), readTool("read_b")] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("并行读取");

  assert.equal(peak, 2);
  assert.equal(faux.state.callCount, 2);
});

test("pending JD dependency recovers without a user-visible tool error", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("search_jds", {}),
      fauxToolCall("find_resume_reuse_candidates", {
        targetJdId: "__pending__",
      }),
    ], { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("find_resume_reuse_candidates", {
      targetJdId: "jd-real",
    }), { stopReason: "toolUse" }),
    fauxAssistantMessage("已使用真实 JD 完成复用检索"),
  ]);
  const searchParameters = Type.Object({});
  const findParameters = Type.Object({ targetJdId: Type.String() });
  const executions: string[] = [];
  const search: AgentTool<typeof searchParameters> = {
    name: "search_jds", label: "Search JDs", description: "Search JDs",
    parameters: searchParameters,
    execute: async () => ({
      content: [{ type: "text", text: JSON.stringify({
        items: [{ id: "jd-real", title: "目标岗位" }],
      }) }],
      details: { items: [{ id: "jd-real", title: "目标岗位" }] },
    }),
  };
  const find: AgentTool<typeof findParameters> = {
    name: "find_resume_reuse_candidates", label: "Find reuse",
    description: "Find resume reuse candidates", parameters: findParameters,
    execute: async (_id, input) => {
      executions.push(input.targetJdId);
      if (input.targetJdId === "__pending__") {
        throw new Error("JD __pending__ 不存在");
      }
      return { content: [{ type: "text", text: "[]" }], details: [] };
    },
  };
  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent({ tools: [search, find] }, {
    model: faux.getModel(),
    streamFn: faux.provider.streamSimple.bind(faux.provider),
  });
  agent.subscribe((event) => { events.push(event); });

  await agent.prompt("基于刚保存的 JD 生成简历");

  assert.deepEqual(executions, ["__pending__", "jd-real"]);
  const findEvents = events.filter((event) =>
    event.type === "tool.completed" &&
    event.name === "find_resume_reuse_candidates"
  );
  assert.equal(findEvents.length, 2);
  assert.ok(findEvents.every((event) =>
    event.type === "tool.completed" && !event.isError
  ));
  const transcript = JSON.stringify(agent.getMessages());
  assert.match(transcript, /deferred_dependency/u);
  assert.doesNotMatch(transcript, /JD __pending__ 不存在/u);
  assert.equal(agent.runStopError, undefined);
});

test("a real missing JD remains a visible tool error", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("find_resume_reuse_candidates", {
      targetJdId: "01a046cf-faf2-78d5-8c1a-b4098e4da9ff",
    }), { stopReason: "toolUse" }),
    fauxAssistantMessage("该 JD 确实不存在"),
  ]);
  const parameters = Type.Object({ targetJdId: Type.String() });
  const find: AgentTool<typeof parameters> = {
    name: "find_resume_reuse_candidates", label: "Find reuse",
    description: "Find resume reuse candidates", parameters,
    execute: async (_id, input) => {
      throw new Error(`JD ${input.targetJdId} 不存在`);
    },
  };
  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent({ tools: [find] }, {
    model: faux.getModel(),
    streamFn: faux.provider.streamSimple.bind(faux.provider),
  });
  agent.subscribe((event) => { events.push(event); });

  await agent.prompt("读取一条已经删除的 JD");

  assert.ok(events.some((event) =>
    event.type === "tool.completed" &&
    event.name === "find_resume_reuse_candidates" && event.isError
  ));
  assert.match(JSON.stringify(agent.getMessages()), /01a046cf.*不存在/u);
  assert.doesNotMatch(JSON.stringify(agent.getMessages()), /deferred_dependency/u);
});

test("agent stops an in-run loop after repeated identical tool outcomes", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("probe", { value: 1 }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("probe", { value: 2 }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("probe", { value: 3 }), { stopReason: "toolUse" }),
    fauxAssistantMessage("不应执行到这里"),
  ]);
  const parameters = Type.Object({ value: Type.Integer() });
  const probe: AgentTool<typeof parameters> = {
    name: "probe",
    label: "Probe",
    description: "Returns an unchanged outcome.",
    parameters,
    execute: async () => ({
      content: [{ type: "text", text: JSON.stringify({ status: "unchanged" }) }],
      details: null,
    }),
  };
  const agent = createCooltoAgent(
    { tools: [probe] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("持续调用 probe");

  assert.equal(faux.state.callCount, 3);
});

test("agent blocks the second consecutive tool call with identical arguments", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("exact_probe", { value: 1 }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(fauxToolCall("exact_probe", { value: 1 }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("已停止重复提交"),
  ]);
  const parameters = Type.Object({ value: Type.Integer() });
  let executionCount = 0;
  const probe: AgentTool<typeof parameters> = {
    name: "exact_probe",
    label: "Exact probe",
    description: "Counts exact calls.",
    parameters,
    execute: async () => {
      executionCount += 1;
      return { content: [{ type: "text", text: "ok" }], details: null };
    },
  };
  const agent = createCooltoAgent(
    { tools: [probe] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("不要重复执行");

  assert.equal(executionCount, 1);
  assert.match(JSON.stringify(agent.getMessages()), /detected_repetition/u);
});

test("read-only JD discovery tolerates duplicate calls within one model loop", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const call = fauxToolCall("search_jds", { q: "投资者关系" });
  faux.setResponses([
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage("已使用最近检索结果继续"),
  ]);
  const parameters = Type.Object({ q: Type.String() });
  let executionCount = 0;
  const search: AgentTool<typeof parameters> = {
    name: "search_jds",
    label: "Search JDs",
    description: "Read-only JD search.",
    parameters,
    execute: async () => {
      executionCount += 1;
      return { content: [{ type: "text", text: "[]" }], details: null };
    },
  };
  const agent = createCooltoAgent(
    { tools: [search] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("查找岗位");

  assert.equal(executionCount, 2);
  assert.doesNotMatch(JSON.stringify(agent.getMessages()), /detected_repetition/u);
});

test("repeated resume workspace creation reaches domain recovery instead of the generic block", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const call = fauxToolCall("create_resume_workspace", { jdId: "jd-1" });
  faux.setResponses([
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage("已按当前 nextAction 继续"),
  ]);
  const parameters = Type.Object({ jdId: Type.String() });
  let executionCount = 0;
  const create: AgentTool<typeof parameters> = {
    name: "create_resume_workspace",
    label: "Create workspace",
    description: "Returns the current domain authority.",
    parameters,
    execute: async () => {
      executionCount += 1;
      return { content: [{ type: "text", text: "unchanged" }], details: null };
    },
  };
  const agent = createCooltoAgent(
    { tools: [create] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("创建简历工作区");

  assert.equal(executionCount, 2);
  assert.doesNotMatch(JSON.stringify(agent.getMessages()), /detected_repetition/u);
});

test("repeated Experience detail batches are blocked before a read loop forms", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const batch = () => fauxAssistantMessage([
    fauxToolCall("get_experience", { experienceId: "exp-a" }),
    fauxToolCall("get_experience", { experienceId: "exp-b" }),
  ], { stopReason: "toolUse" });
  faux.setResponses([batch(), batch(), fauxAssistantMessage("已使用现有经历继续")]);
  const parameters = Type.Object({ experienceId: Type.String() });
  let executionCount = 0;
  const getExperience: AgentTool<typeof parameters> = {
    name: "get_experience",
    label: "Get Experience",
    description: "Reads one immutable Experience detail.",
    parameters,
    execute: async (_id, input) => {
      executionCount += 1;
      return {
        content: [{ type: "text", text: JSON.stringify(input) }],
        details: input,
      };
    },
  };
  const agent = createCooltoAgent(
    { tools: [getExperience] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("读取两条经历后继续写简历");

  assert.equal(executionCount, 2);
  assert.match(JSON.stringify(agent.getMessages()), /detected_repetition/u);
  assert.equal(agent.runStopError, undefined);
});

test("Experience detail may be read again for a later real user prompt", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const read = () => fauxAssistantMessage(
    fauxToolCall("get_experience", { experienceId: "exp-a" }),
    { stopReason: "toolUse" },
  );
  faux.setResponses([
    read(), fauxAssistantMessage("第一次读取完成"),
    read(), fauxAssistantMessage("第二次读取完成"),
  ]);
  const parameters = Type.Object({ experienceId: Type.String() });
  let executionCount = 0;
  const tool: AgentTool<typeof parameters> = {
    name: "get_experience", label: "Get Experience", description: "read",
    parameters,
    execute: async () => {
      executionCount += 1;
      return { content: [{ type: "text", text: "ok" }], details: null };
    },
  };
  const agent = createCooltoAgent(
    { tools: [tool] },
    { model: faux.getModel(), streamFn: faux.provider.streamSimple.bind(faux.provider) },
  );

  await agent.prompt("第一次读取");
  await agent.prompt("稍后再次读取");

  assert.equal(executionCount, 2);
});

test("internal recovery cannot reset the current user's Experience read set", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const read = () => fauxAssistantMessage(
    fauxToolCall("get_experience", { experienceId: "exp-a" }),
    { stopReason: "toolUse" },
  );
  faux.setResponses([
    read(), fauxAssistantMessage("第一次读取完成"),
    read(), fauxAssistantMessage("已使用原结果继续"),
  ]);
  const parameters = Type.Object({ experienceId: Type.String() });
  let executionCount = 0;
  const tool: AgentTool<typeof parameters> = {
    name: "get_experience", label: "Get Experience", description: "read",
    parameters,
    execute: async () => {
      executionCount += 1;
      return { content: [{ type: "text", text: "ok" }], details: null };
    },
  };
  const agent = createCooltoAgent(
    { tools: [tool] },
    { model: faux.getModel(), streamFn: faux.provider.streamSimple.bind(faux.provider) },
  );

  await agent.prompt("读取经历后继续");
  await agent.prompt(wrapInternalPrompt("继续当前任务"));

  assert.equal(executionCount, 1);
  assert.match(JSON.stringify(agent.getMessages()), /detected_repetition/u);
});

test("resume writes bypass the generic exact-call block and return workspace authority", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const call = fauxToolCall("apply_resume_content", {
    candidateId: "candidate-1",
    expectedRevision: 4,
  });
  faux.setResponses([
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage("已按最新工作区继续"),
  ]);
  const parameters = Type.Object({
    candidateId: Type.String(),
    expectedRevision: Type.Integer(),
  });
  let executionCount = 0;
  const apply: AgentTool<typeof parameters> = {
    name: "apply_resume_content",
    label: "Apply resume",
    description: "Returns the current authoritative workspace.",
    parameters,
    execute: async () => {
      executionCount += 1;
      const payload = {
        revision: 5,
        status: "needs_revision",
        readiness: { ready: false },
        nextAction: { mode: "batch_tail_repair", bulletIds: ["bullet-2"] },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: { ...payload, loopGuardKey: "revision:5:bullet-2" },
      };
    },
  };
  const agent = createCooltoAgent(
    { tools: [apply] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("继续修复简历");

  assert.equal(executionCount, 2);
  assert.doesNotMatch(JSON.stringify(agent.getMessages()), /detected_repetition/u);
});

test("workspace recovery can return a compact directive on one exact repeat", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const call = fauxToolCall("get_resume_workspace", {});
  faux.setResponses([
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage("已执行恢复回执中的下一动作"),
  ]);
  const parameters = Type.Object({});
  let executionCount = 0;
  const getWorkspace: AgentTool<typeof parameters> = {
    name: "get_resume_workspace",
    label: "Get resume workspace",
    description: "Returns workspace authority once, then a compact directive.",
    parameters,
    execute: async () => {
      executionCount += 1;
      const payload = {
        revision: 5,
        status: "needs_revision",
        nextAction: { mode: "batch_tail_repair", bulletIds: ["bullet-2"] },
        recovery: {
          repeated: executionCount > 1,
          instruction: "禁止再次调用 get_resume_workspace，立即执行 nextAction",
        },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: { ...payload, loopGuardKey: "revision:5:bullet-2" },
      };
    },
  };
  const agent = createCooltoAgent(
    { tools: [getWorkspace] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("恢复简历");

  assert.equal(executionCount, 2);
  assert.doesNotMatch(JSON.stringify(agent.getMessages()), /detected_repetition/u);
});

test("agent stops immediately after an authoritative ready resume result", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const call = fauxToolCall("apply_resume_content", { value: 1 });
  faux.setResponses([
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
  ]);
  const parameters = Type.Object({ value: Type.Integer() });
  let executionCount = 0;
  const apply: AgentTool<typeof parameters> = {
    name: "apply_resume_content",
    label: "Apply resume",
    description: "Returns an authoritative terminal resume result.",
    parameters,
    execute: async () => {
      executionCount += 1;
      const payload = {
        status: "ready_for_approval",
        readiness: { ready: true },
        nextAction: { mode: "stop" },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: payload,
      };
    },
  };
  const agent = createCooltoAgent(
    { tools: [apply] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("完成简历");

  assert.equal(executionCount, 1);
  assert.equal(faux.state.callCount, 1);
  assert.equal(agent.runStopError, undefined);
});

test("agent permits one exact retry after a transient tool failure", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("transient_probe", { value: 1 }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(fauxToolCall("transient_probe", { value: 1 }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("重试成功"),
  ]);
  const parameters = Type.Object({ value: Type.Integer() });
  let executionCount = 0;
  const probe: AgentTool<typeof parameters> = {
    name: "transient_probe",
    label: "Transient probe",
    description: "Fails transiently once.",
    parameters,
    execute: async () => {
      executionCount += 1;
      if (executionCount === 1) throw new Error("network timeout");
      return { content: [{ type: "text", text: "ok" }], details: null };
    },
  };
  const agent = createCooltoAgent(
    { tools: [probe] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("允许一次网络重试");

  assert.equal(executionCount, 2);
  assert.doesNotMatch(JSON.stringify(agent.getMessages()), /detected_repetition/u);
});

test("agent reports a failed run after four calls without measured progress", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    ...Array.from({ length: 4 }, (_, index) =>
      fauxAssistantMessage(fauxToolCall("changing_probe", { value: index }), {
        stopReason: "toolUse",
      }),
    ),
    fauxAssistantMessage("不应执行到这里"),
  ]);
  const parameters = Type.Object({ value: Type.Integer() });
  const probe: AgentTool<typeof parameters> = {
    name: "changing_probe",
    label: "Changing probe",
    description: "Returns a changing result.",
    parameters,
    execute: async (_id, input) => ({
      content: [{ type: "text", text: JSON.stringify({ value: input.value }) }],
      details: { loopGuardKey: "changing_probe", value: input.value },
    }),
  };
  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent(
    { tools: [probe] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );
  agent.subscribe((event) => {
    events.push(event);
  });

  await agent.prompt("持续调用 changing_probe");

  assert.equal(faux.state.callCount, 4);
  assert.match(agent.runStopError ?? "", /没有产生新的正式内容或版面进展/u);
  const failed = events.find((event) => event.type === "run.failed");
  assert.equal(failed?.type, "run.failed");
  if (failed?.type === "run.failed") {
    assert.equal(failed.governorStopReason, "same_tool_sequence");
  }
  assert.equal(events.some((event) => event.type === "run.completed"), false);
});

test("turn governor reasons produce accurate user-facing errors", () => {
  assert.match(turnGovernorError("same_tool_outcome"), /相同结果/u);
  assert.match(turnGovernorError("same_tool_sequence"), /正式内容或版面进展/u);
  assert.match(turnGovernorError("repeated_tool_errors"), /工具调用失败/u);
  assert.match(turnGovernorError("maximum_turns"), /轮次上限/u);
  assert.match(turnGovernorError("maximum_phase_turns"), /轮次上限/u);
  assert.match(turnGovernorError("maximum_total_turns"), /轮次上限/u);
  assert.match(turnGovernorError("terminal_model_failure"), /模型执行被中断/u);
});

test("a product user boundary wins before the generic turn governor", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses(Array.from({ length: 3 }, (_, index) =>
    fauxAssistantMessage(fauxToolCall("boundary_probe", { value: index }), {
      stopReason: "toolUse",
    })
  ));
  const parameters = Type.Object({ value: Type.Integer() });
  let executions = 0;
  const probe: AgentTool<typeof parameters> = {
    name: "boundary_probe", label: "Boundary probe",
    description: "Produces one stable loop key before a user boundary.",
    parameters,
    execute: async () => {
      executions += 1;
      return {
        content: [{ type: "text", text: "same state" }],
        details: { loopGuardKey: "same-key", userBoundary: executions === 3 },
      };
    },
  };
  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent({
    tools: [probe],
    shouldStopAfterTurn: (context) => context.toolResults.some((result) =>
      (result.details as { userBoundary?: boolean })?.userBoundary === true
    ),
  }, {
    model: faux.getModel(),
    streamFn: faux.provider.streamSimple.bind(faux.provider),
  });
  agent.subscribe((event) => { events.push(event); });

  await agent.prompt("推进到用户边界");

  assert.equal(executions, 3);
  assert.equal(agent.runStopError, undefined);
  assert.equal(events.some((event) => event.type === "run.failed"), false);
  assert.equal(events.at(-1)?.type, "run.completed");
});

test("changing progress keys may continue beyond the no-progress limit", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    ...Array.from({ length: 6 }, (_, index) =>
      fauxAssistantMessage(fauxToolCall("six_pass_probe", { value: index }), {
        stopReason: "toolUse",
      }),
    ),
    fauxAssistantMessage("六轮后完成"),
  ]);
  const parameters = Type.Object({ value: Type.Integer() });
  const probe: AgentTool<typeof parameters> = {
    name: "six_pass_probe",
    label: "Six-pass probe",
    description: "Returns a changing result.",
    parameters,
    execute: async (_id, input) => ({
      content: [{ type: "text", text: JSON.stringify({ value: input.value }) }],
      details: { loopGuardKey: `six_pass_probe:${input.value}` },
    }),
  };
  const agent = createCooltoAgent(
    { tools: [probe] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("执行六轮后结束");

  assert.equal(faux.state.callCount, 7);
  assert.equal(agent.runStopError, undefined);
  assert.equal(agent.getMessages().at(-1)?.role, "assistant");
});

test("changing read calls without an opt-in loop key may exceed six pages", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    ...Array.from({ length: 7 }, (_, index) =>
      fauxAssistantMessage(fauxToolCall("paged_read", { page: index }), {
        stopReason: "toolUse",
      }),
    ),
    fauxAssistantMessage("读取完成"),
  ]);
  const parameters = Type.Object({ page: Type.Integer() });
  const read: AgentTool<typeof parameters> = {
    name: "paged_read",
    label: "Paged read",
    description: "Reads one changing page.",
    parameters,
    execute: async (_id, input) => ({
      content: [{ type: "text", text: JSON.stringify({ page: input.page }) }],
      details: { page: input.page },
    }),
  };
  const agent = createCooltoAgent(
    { tools: [read] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("读取全部分页");

  assert.equal(faux.state.callCount, 8);
  assert.equal(agent.runStopError, undefined);
});

test("agent transparently retries one streamed response that repeats a long cycle", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const unit =
    "证据中的数字与候选文本仍不一致，因此当前写入会被宿主拒绝。" +
    "继续换一种相同表述不会产生新进展，应当停止当前输出并保留已有草稿。" +
    "这是一次模型响应内部的内容循环，而不是多轮工具调用。";
  faux.setResponses([
    fauxAssistantMessage(unit.repeat(12)),
    fauxAssistantMessage("已从最近一次有效状态恢复并完成"),
  ]);
  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent(
    { tools: [] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );
  agent.subscribe((event) => {
    events.push(event);
  });

  await agent.prompt("生成内容");

  assert.equal(agent.stoppedForOutputRepetition, false);
  assert.equal(faux.state.callCount, 2);
  assert.equal(events.some((event) => event.type === "run.failed"), false);
  assert.equal(events.some((event) => event.type === "run.completed"), true);
  assert.equal(JSON.stringify(agent.getMessages()).includes(unit), false);
  assert.equal(agent.getMessages().filter((message) => message.role === "user").length, 1);
  assert.doesNotMatch(JSON.stringify(agent.getMessages()), /coolto_internal_continuation/u);
});

test("resume repetition recovery receives the exact reason and authority", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const unit = "模型正在重复展示同一段尾行计划但没有调用工具。".repeat(8);
  faux.setResponses([
    fauxAssistantMessage(unit.repeat(8)),
    fauxAssistantMessage("已按权威 nextAction 恢复工具推进"),
  ]);
  const recoveries: Array<{ sequence: number; reason: string }> = [];
  const agent = createCooltoAgent(
    {
      tools: [],
      outputRepetitionRecovery: (sequence, reason) => {
        recoveries.push({ sequence, reason });
        return "candidateId=resume-1 expectedRevision=8 nextAction=batch_tail_rewrite";
      },
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("继续修复剩余短尾");

  assert.deepEqual(recoveries, [{ sequence: 1, reason: "repeated_cycle" }]);
  assert.equal(agent.runStopError, undefined);
  assert.doesNotMatch(JSON.stringify(agent.getMessages()), /candidateId=resume-1/u);
});

test("resume agent keeps recovering runaway narration without persisting it", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const narration = Array.from(
    { length: 6_101 },
    (_, index) => String.fromCodePoint(0x4e00 + index),
  ).join("");
  faux.setResponses([
    fauxAssistantMessage(narration),
    fauxAssistantMessage(narration),
    fauxAssistantMessage(narration),
    fauxAssistantMessage(narration),
    fauxAssistantMessage("简历已从最近一次有效草稿继续完成"),
  ]);
  const events: CooltoAgentEvent[] = [];
  const toolChoices: unknown[] = [];
  const agent = createCooltoAgent(
    {
      tools: [],
      outputRepetitionRecovery: () =>
        "第一项输出必须是工具调用；不要输出可见计划。",
    },
    {
      model: faux.getModel(),
      streamFn: (model, context, options) => {
        toolChoices.push((options as { toolChoice?: unknown })?.toolChoice);
        return faux.provider.streamSimple(model, context, options);
      },
    },
  );
  agent.subscribe((event) => {
    events.push(event);
  });

  await agent.prompt("生成内容");

  assert.equal(agent.stoppedForOutputRepetition, false);
  assert.equal(agent.runStopError, undefined);
  assert.equal(faux.state.callCount, 5);
  assert.equal(events.some((event) => event.type === "run.failed"), false);
  assert.equal(events.some((event) => event.type === "run.completed"), true);
  assert.deepEqual(toolChoices, [undefined, "required", "required", "required", "required"]);
  assert.doesNotMatch(JSON.stringify(agent.getMessages()), new RegExp(narration.slice(0, 64), "u"));
  assert.match(JSON.stringify(agent.getMessages()), /简历已从最近一次有效草稿继续完成/u);
});

test("agent transparently retries one transient model stream failure", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage("未完成的过长规划", {
      stopReason: "error",
      errorMessage: "terminated",
    }),
    fauxAssistantMessage("已从最近工具结果恢复并完成"),
  ]);
  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent(
    { tools: [] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );
  agent.subscribe((event) => {
    events.push(event);
  });

  await agent.prompt("生成内容");

  assert.equal(faux.state.callCount, 2);
  assert.equal(agent.runStopError, undefined);
  assert.equal(events.some((event) => event.type === "run.failed"), false);
  assert.equal(events.at(-1)?.type, "run.completed");
  assert.equal(JSON.stringify(agent.getMessages()).includes("未完成的过长规划"), false);
});

test("agent surfaces a transient model error after one retry", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage("first partial", { stopReason: "error", errorMessage: "terminated" }),
    fauxAssistantMessage("second partial", { stopReason: "error", errorMessage: "socket hang up" }),
  ]);
  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent(
    { tools: [] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );
  agent.subscribe((event) => {
    events.push(event);
  });

  await agent.prompt("生成内容");

  assert.equal(faux.state.callCount, 2);
  assert.match(agent.runStopError ?? "", /模型连接暂时中断/u);
  assert.equal(events.some((event) => event.type === "run.failed"), true);
});

test("agent preserves a non-transient model error", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage("", {
      stopReason: "error",
      errorMessage: "insufficient_quota",
    }),
  ]);
  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent(
    { tools: [] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );
  agent.subscribe((event) => {
    events.push(event);
  });

  await agent.prompt("生成内容");

  assert.equal(faux.state.callCount, 1);
  assert.equal(agent.runStopError, "insufficient_quota");
  assert.equal(events.filter((event) => event.type === "run.failed").length, 1);
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
