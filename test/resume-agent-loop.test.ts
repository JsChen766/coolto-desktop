import assert from "node:assert/strict";
import test from "node:test";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { ResumeLayoutInspector } from "../src/resume/planning/layout-inspector.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createToolRegistry } from "../src/tools/registry.js";
import {
  FixtureResumeCompiler,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

test("the Agent drives draft, parallel bullet writes and inspect to layout_qualified", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall(
        "prepare_resume_draft",
        {
          jdId: "jd-1",
          experienceIds: ["edu-1", "work-1"],
          language: "zh-CN",
        },
        { id: "draft-call" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxToolCall(
        "write_bullet",
        {
          itemId: "item-work-1",
          evidenceIds: ["work-1:0:19"],
          bulletText: "使用 Python 清洗运营数据产品，设计异常检查规则并沉淀可复用流程。",
          targetChars: { min: 20, max: 300 },
        },
        { id: "bullet-1" },
      ),
      fauxToolCall(
        "write_bullet",
        {
          itemId: "item-work-1",
          evidenceIds: ["work-1:19:33"],
          bulletText: "为 3 个团队建立周度报表，并与业务团队协作落地。",
          targetChars: { min: 20, max: 300 },
        },
        { id: "bullet-2" },
      ),
    ], { stopReason: "toolUse" }),
    fauxAssistantMessage(
      fauxToolCall("inspect_resume_draft", {}, { id: "inspect-call" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("页面与证据门槛已通过，停止修改。"),
  ]);
  const agent = createCooltoAgent(
    {
      tools: createToolRegistry({
        resumeSourceSnapshotBuilder: builder,
        resumeLayoutInspector: new ResumeLayoutInspector(builder, compiler),
        agentOrchestrated: {
          snapshotBuilder: builder,
          compiler,
          store,
        },
      }),
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("请基于这个 JD 和经历生成满足页面门槛的简历");

  assert.equal(faux.state.callCount, 4);
  assert.equal(store.latest()?.status, "layout_qualified");
  const tools = agent.toolNames;
  for (const name of [
    "prepare_resume_draft",
    "write_bullet",
    "inspect_resume_draft",
    "inspect_resume_layout",
  ]) {
    assert.ok(tools.includes(name), `missing tool ${name}`);
  }
  assert.ok(!tools.includes("prepare_planned_resume"), "retired tool must not be registered");
  assert.ok(!tools.includes("prepare_resume_candidate"), "retired tool must not be registered");
  const transcript = JSON.stringify(agent.getMessages());
  assert.match(transcript, /使用 Python 清洗运营数据/);
  assert.match(transcript, /layout_qualified/);
});

test("the Agent corrects a rejected bullet and still reaches layout_qualified", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall(
        "prepare_resume_draft",
        {
          jdId: "jd-1",
          experienceIds: ["edu-1", "work-1"],
          language: "zh-CN",
        },
        { id: "draft-call" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall(
        "write_bullet",
        {
          itemId: "item-work-1",
          evidenceIds: ["work-1:0:19"],
          bulletText: "使用 Python 清洗数据，服务 99 个内部团队。",
          targetChars: { min: 20, max: 300 },
        },
        { id: "bullet-bad" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall(
        "write_bullet",
        {
          itemId: "item-work-1",
          evidenceIds: ["work-1:0:19", "work-1:19:33"],
          bulletText: "使用 Python 清洗运营数据产品，为 3 个团队建立周度报表并沉淀流程。",
          targetChars: { min: 20, max: 300 },
        },
        { id: "bullet-good" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall("inspect_resume_draft", {}, { id: "inspect-call" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("页面与证据门槛已通过，停止修改。"),
  ]);
  const agent = createCooltoAgent(
    {
      tools: createToolRegistry({
        resumeSourceSnapshotBuilder: builder,
        resumeLayoutInspector: new ResumeLayoutInspector(builder, compiler),
        agentOrchestrated: {
          snapshotBuilder: builder,
          compiler,
          store,
        },
      }),
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("生成一份简历，先写第一条 bullet 再补全");

  assert.equal(faux.state.callCount, 5);
  assert.equal(store.latest()?.bindings.length, 1);
  assert.notEqual(store.latest()?.status, "needs_revision");
  const transcript = JSON.stringify(agent.getMessages());
  assert.match(transcript, /数字 99 在证据原文中不存在/);
  assert.match(transcript, /accepted/);
});
