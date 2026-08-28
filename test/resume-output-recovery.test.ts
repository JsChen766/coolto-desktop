import assert from "node:assert/strict";
import test from "node:test";

import { buildResumeOutputRecoveryInstruction } from
  "../src/desktop/main/resume-generation-follow-up.js";
import { createResumeTurnGovernorRecovery } from
  "../src/desktop/main/resume-generation-follow-up.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

test("resume output recovery injects the exact pending tail action", () => {
  const instruction = buildResumeOutputRecoveryInstruction({
    reason: "narrative_limit",
    candidateId: "candidate-1",
    revision: 9,
    nextAction: {
      mode: "batch_tail_rewrite",
      requiredInput: "tailRewrites",
      bulletIds: ["bullet-a", "bullet-b"],
      tailRewriteTargets: [{
        bulletId: "bullet-a",
        currentText: "当前有效工作稿",
        requiredEdit: "只做最小语义增补",
      }],
    },
  });

  assert.match(instruction, /可见说明超过限制/u);
  assert.match(instruction, /candidate-1/u);
  assert.match(instruction, /expectedRevision=9/u);
  assert.match(instruction, /batch_tail_rewrite/u);
  assert.match(instruction, /bullet-a/u);
  assert.match(instruction, /当前有效工作稿/u);
  assert.match(instruction, /第一项输出必须是工具调用/u);
});

test("material recovery respects a prior user refusal instead of inventing a question", () => {
  const instruction = buildResumeOutputRecoveryInstruction({
    reason: "repeated_cycle",
    candidateId: "candidate-1",
    revision: 3,
    nextAction: {
      mode: "request_more_material",
      question: "请补充一个事实",
    },
  });
  assert.match(instruction, /不需要补充或没有更多材料/u);
  assert.match(instruction, /confirm_no_resume_material/u);
  assert.match(instruction, /否则只提出以下一个权威问题/u);
});

test("turn governor recovery stops at the best draft instead of asking for material", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(),
    new FixtureResumeCompiler(),
    store,
  );
  await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "secondary" }],
  });
  const instruction = createResumeTurnGovernorRecovery(store)(
    1,
    "same_tool_sequence",
  );

  assert.match(instruction ?? "", /decline_resume_material/u);
  assert.match(instruction ?? "", /resolution=best_effort_stalled/u);
  assert.doesNotMatch(instruction ?? "", /旧简历、工作总结、项目文档/u);
  assert.match(instruction ?? "", /不要重试原工具/u);
});

test("turn governor recovery advances before a resume workspace exists", () => {
  const instruction = createResumeTurnGovernorRecovery(
    new ResumeWorkspaceStore(),
  )(1, "same_tool_sequence");

  assert.match(instruction ?? "", /工作区尚未创建/u);
  assert.match(instruction ?? "", /绝对不得再次调用 search_jds/u);
  assert.match(instruction ?? "", /调用 get_jd/u);
});

test("turn governor recovery stops after neutral closure makes no progress", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(),
    new FixtureResumeCompiler(),
    store,
  );
  await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "secondary" }],
  });
  const workspace = store.latest()!;
  store.restore({
    ...workspace,
    factNeutralAuthorization: {
      sourceRequestKind: "tail_repair_stalled",
      confirmedAt: "2026-08-26T00:00:00.000Z",
      confirmedMessageTimestamp: 200,
    },
  });

  const instruction = createResumeTurnGovernorRecovery(store)(
    2,
    "same_tool_sequence",
  );

  assert.match(instruction ?? "", /decline_resume_material/u);
  assert.match(instruction ?? "", /resolution=best_effort_stalled/u);
  assert.doesNotMatch(instruction ?? "", /批量工具调用/u);
  assert.doesNotMatch(instruction ?? "", /旧简历、工作总结、项目文档/u);
});
