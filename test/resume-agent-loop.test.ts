import assert from "node:assert/strict";
import test from "node:test";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createToolRegistry } from "../src/tools/registry.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

test("the Agent can prepare, patch, and stop when the G3 layout gates pass", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "candidate-agent-loop",
  });
  const patcher = new ResumeCandidatePatcher(compiler, store);
  const first = createBinding(snapshot, "bullet-1", "使用 Python 清洗运营数据。");
  const second = createBinding(snapshot, "bullet-2", "为 3 个团队建立周度报表。");
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall(
        "prepare_resume_candidate",
        {
          jdId: "jd-1",
          experienceIds: ["edu-1", "work-1"],
          language: "zh-CN",
          initialBindings: [first],
        },
        { id: "prepare-call" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall(
        "patch_resume_candidate",
        {
          candidateId: "candidate-agent-loop",
          expectedRevision: 0,
          operations: [
            { op: "add_bullet", itemId: "item-work-1", binding: second },
          ],
        },
        { id: "patch-call" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("G3 页面与来源门槛已经通过，已停止继续扩写。"),
  ]);
  const agent = createCooltoAgent(
    {
      tools: createToolRegistry({
        resumeSourceSnapshotBuilder: builder,
        resumeCandidatePreparer: preparer,
        resumeCandidatePatcher: patcher,
      }),
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("请基于这个 JD 和经历生成满足页面门槛的简历");

  assert.equal(faux.state.callCount, 3);
  assert.equal(store.get("candidate-agent-loop").status, "layout_qualified");
  assert.deepEqual(
    agent.toolNames.filter((name) => name.includes("resume_candidate")),
    ["prepare_resume_candidate", "patch_resume_candidate"],
  );
  const transcript = JSON.stringify(agent.getMessages());
  assert.match(transcript, /pxToMinimum/);
  assert.match(transcript, /使用 Python 清洗运营数据/);
  assert.match(transcript, /layout_qualified/);
});
