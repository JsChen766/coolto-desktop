import assert from "node:assert/strict";
import test from "node:test";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createToolRegistry } from "../src/tools/registry.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

test("one Agent prompt creates and batch-writes a resume workspace", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("create_resume_workspace", {
        jdId: "jd-1",
        language: "zh-CN",
        experiences: [
          { experienceId: "edu-1" },
          { experienceId: "work-1", tier: "secondary" },
        ],
      }),
      { stopReason: "toolUse" },
    ),
    (context) => {
      const serialized = JSON.stringify(context.messages);
      const match = serialized.match(/resume-workspace-[0-9a-f-]+/u);
      assert.ok(match, serialized);
      return fauxAssistantMessage(
      fauxToolCall("apply_resume_content", {
        candidateId: match[0],
        expectedRevision: 0,
        items: [
          {
            itemId: "item-work-1",
            bullets: [
              {
                text: "使用 Python 清洗运营数据产品",
                origin: "grounded",
                evidenceIds: ["work-1:0:19"],
                requirementIds: ["req-1"],
              },
              {
                text: "为 3 个团队建立周度报表",
                origin: "grounded",
                evidenceIds: ["work-1:19:33"],
                requirementIds: ["req-1"],
              },
            ],
          },
        ],
      }),
      { stopReason: "toolUse" },
    );},
    fauxAssistantMessage("已根据真实页面测量完成本轮生成"),
  ]);
  const agent = createCooltoAgent(
    {
      tools: createToolRegistry({
        agentOrchestrated: { snapshotBuilder: builder, compiler, store },
      }),
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("生成一页针对性简历");

  assert.equal(faux.state.callCount, 2);
  assert.equal(agent.runStopError, undefined);
  assert.equal(store.latest()?.revision, 1);
  assert.equal(compiler.structures.length, 2);
  assert.deepEqual(
    agent.toolNames.filter((name) => name.includes("resume_workspace") || name === "apply_resume_content"),
    ["create_resume_workspace", "get_resume_workspace", "apply_resume_content"],
  );
  assert.equal(agent.toolNames.includes("pause_resume_for_material"), true);
  assert.equal(agent.toolNames.includes("assess_resume_evidence"), true);
  for (const retired of [
    "prepare_resume_draft",
    "write_bullet",
    "inspect_resume_draft",
    "patch_resume_candidate",
    "prepare_resume_save",
    "prepare_resume_pdf_export",
  ]) {
    assert.equal(agent.toolNames.includes(retired), false, retired);
  }
});
