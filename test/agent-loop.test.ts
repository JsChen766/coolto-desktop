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

test("mail capture permits one exact idempotency replay then blocks the third", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const call = fauxToolCall("capture_browser_mail_event", { marker: "A" });
  faux.setResponses([
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage(call, { stopReason: "toolUse" }),
    fauxAssistantMessage("已验证幂等重放"),
  ]);
  const parameters = Type.Object({ marker: Type.String() });
  let executionCount = 0;
  const capture: AgentTool<typeof parameters> = {
    name: "capture_browser_mail_event",
    label: "Capture mail",
    description: "Returns one stable event for the same mail.",
    parameters,
    execute: async () => {
      executionCount += 1;
      return { content: [{ type: "text", text: "event-1" }], details: null };
    },
  };
  const agent = createCooltoAgent(
    { tools: [capture] },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("重复捕获同一封邮件");

  assert.equal(executionCount, 2);
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
  assert.match(agent.runStopError ?? "", /连续重复调用同一工具/u);
  const failed = events.find((event) => event.type === "run.failed");
  assert.equal(failed?.type, "run.failed");
  if (failed?.type === "run.failed") {
    assert.equal(failed.governorStopReason, "same_tool_sequence");
  }
  assert.equal(events.some((event) => event.type === "run.completed"), false);
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

test("agent fails when both output repetition retries also degenerate", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const unit = "模型输出进入重复循环，当前内容没有新增事实或工具进展。".repeat(4);
  faux.setResponses([
    fauxAssistantMessage(unit.repeat(8)),
    fauxAssistantMessage(unit.repeat(8)),
    fauxAssistantMessage(unit.repeat(8)),
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

  assert.equal(agent.stoppedForOutputRepetition, true);
  assert.equal(faux.state.callCount, 3);
  assert.equal(events.some((event) => event.type === "run.failed"), true);
  assert.equal(events.some((event) => event.type === "run.completed"), false);
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
