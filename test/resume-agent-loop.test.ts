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
import { ResumeQualityEvaluator } from "../src/resume/quality/quality-evaluator.js";
import { ResumeCandidateReviewer } from "../src/resume/quality/candidate-reviewer.js";
import { ResumeAlternativeRepairer } from "../src/resume/quality/alternative-repairer.js";
import { createToolRegistry } from "../src/tools/registry.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

test("the Agent can prepare, patch, and stop after host quality review", async () => {
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
  const evaluator = new ResumeQualityEvaluator();
  const reviewer = new ResumeCandidateReviewer(evaluator, store);
  const repairer = new ResumeAlternativeRepairer(compiler, evaluator, store);
  const first = createBinding(snapshot, "bullet-1", "使用 Python 清洗运营数据产品。");
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
        resumeCandidateReviewer: reviewer,
        resumeAlternativeRepairer: repairer,
      }),
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("请基于这个 JD 和经历生成满足页面门槛的简历");

  assert.equal(faux.state.callCount, 3);
  assert.equal(store.get("candidate-agent-loop").status, "ready_for_approval");
  assert.deepEqual(
    agent.toolNames.filter((name) => name.includes("resume_candidate")),
    [
      "prepare_resume_candidate",
      "patch_resume_candidate",
      "review_resume_candidate",
    ],
  );
  const transcript = JSON.stringify(agent.getMessages());
  assert.match(transcript, /pxToMinimum/);
  assert.match(transcript, /使用 Python 清洗运营数据/);
  assert.match(transcript, /ready_for_approval/);
});

test("the Agent can review, repair one reported target, and stop at ready_for_approval", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const evaluator = new ResumeQualityEvaluator();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "candidate-quality-loop",
  });
  const patcher = new ResumeCandidatePatcher(compiler, store);
  const reviewer = new ResumeCandidateReviewer(evaluator, store);
  const repairer = new ResumeAlternativeRepairer(compiler, evaluator, store);
  const first = createBinding(snapshot, "bullet-1", "使用 Python 清洗运营数据产品。");
  const duplicate = createBinding(
    snapshot,
    "bullet-2",
    "为 3 个团队建立周度报表。",
    "使用 Python 清洗运营数据产品。",
  );
  const distinct = createBinding(snapshot, "bullet-2", "为 3 个团队建立周度报表。");
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall(
        "prepare_resume_candidate",
        {
          jdId: "jd-1",
          experienceIds: ["edu-1", "work-1"],
          language: "zh-CN",
          initialBindings: [first, duplicate],
        },
        { id: "quality-prepare" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall(
        "patch_resume_candidate",
        {
          candidateId: "candidate-quality-loop",
          expectedRevision: 0,
          alternativeTargets: [
            {
              targetId: "near_duplicate_bullet:bl-0-bl-1:0",
              alternatives: [
                {
                  label: "use distinct evidence",
                  operations: [
                    {
                      op: "replace_bullet",
                      bulletId: "bl-1",
                      binding: distinct,
                    },
                  ],
                },
              ],
            },
          ],
        },
        { id: "quality-repair" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("质量和布局门禁均已通过，已停止修改。"),
  ]);
  const agent = createCooltoAgent(
    {
      tools: createToolRegistry({
        resumeSourceSnapshotBuilder: builder,
        resumeCandidatePreparer: preparer,
        resumeCandidatePatcher: patcher,
        resumeCandidateReviewer: reviewer,
        resumeAlternativeRepairer: repairer,
      }),
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("完成质量检查并只修复报告指出的问题");

  assert.equal(faux.state.callCount, 3);
  assert.equal(store.get("candidate-quality-loop").status, "ready_for_approval");
  assert.match(JSON.stringify(agent.getMessages()), /ready_for_approval/);
});
