import assert from "node:assert/strict";
import test from "node:test";

import { instructionFor } from "../src/resume/workspace/diagnostics-projection.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

test("needs_user_decision guidance leads the user to add experiences when evidence is exhausted", async () => {
  const { workspace } = await createWorkspaceWithConsumedEvidence(true);
  const instruction = instructionFor({
    ...workspace,
    status: "needs_user_decision",
  });
  assert.match(instruction, /素材不足/);
  assert.match(instruction, /补充经历/);
  assert.match(instruction, /不得降低任何质量门槛/);
});

test("needs_user_decision keeps standard guidance while evidence remains", async () => {
  const { workspace } = await createWorkspaceWithConsumedEvidence(false);
  const instruction = instructionFor({
    ...workspace,
    status: "needs_user_decision",
  });
  assert.doesNotMatch(instruction, /素材不足/);
  assert.match(instruction, /两条出路/);
});

async function createWorkspaceWithConsumedEvidence(consumeAll: boolean) {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "instruction-test",
  });
  const patcher = new ResumeCandidatePatcher(compiler, store);
  const prepared = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
  });
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const allOperations = [
    {
      op: "add_bullet" as const,
      itemId: "item-work-1",
      binding: createBinding(snapshot, "w-1", "使用 Python 清洗运营数据产品。"),
    },
    {
      op: "add_bullet" as const,
      itemId: "item-work-1",
      binding: createBinding(snapshot, "w-2", "为 3 个团队建立周度报表。"),
    },
    {
      op: "add_bullet" as const,
      itemId: "item-work-1",
      binding: createBinding(snapshot, "w-3", "设计异常检查规则并与业务团队协作。"),
    },
    {
      op: "add_bullet" as const,
      itemId: "item-edu-1",
      binding: {
        bulletText: "主修信息系统与数据分析。",
        evidenceIds: ["edu-1:0:12"],
      },
    },
  ];
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: consumeAll ? allOperations : allOperations.slice(0, 1),
  });
  return { builder, store, workspace: store.latest()!, prepared, snapshot, patcher };
}
