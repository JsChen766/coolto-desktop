import assert from "node:assert/strict";
import test from "node:test";

import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceError } from "../src/resume/workspace/errors.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import {
  BASE_WORK_CONTENT,
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

const FIRST_QUOTE = "使用 Python 清洗运营数据产品。";
const SECOND_QUOTE = "为 3 个团队建立周度报表。";
const THIRD_QUOTE = "设计异常检查规则并与业务团队协作。";

async function createInitial() {
  const builder = createWorkspaceSnapshotBuilder({
    workContent: BASE_WORK_CONTENT,
  });
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "deadlock-test",
  });
  const patcher = new ResumeCandidatePatcher(compiler, store);
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const prepared = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
  });
  const sections = prepared.structure.sections;
  const skillsItemId = sections
    .flatMap((section) => section.items)
    .find((item) => item.id.startsWith("item-skills-"))!.id;
  const workItemId = sections
    .flatMap((section) => section.items)
    .find((item) => item.source_experience_id === "work-1")!.id;
  return { snapshot, patcher, prepared, skillsItemId, workItemId };
}

test("skill bullet ranges do not reserve evidence for normal bullets", async () => {
  const { snapshot, patcher, prepared, skillsItemId, workItemId } =
    await createInitial();
  // 技能区 bullet 引用句 1（soft evidence，区间可共享）
  const p1 = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: skillsItemId,
        binding: createBinding(snapshot, "skill-b", FIRST_QUOTE),
      },
    ],
  });
  // 普通 bullet 引用同一句 1：修复前被误判为区间冲突，修复后应通过
  const p2 = await patcher.patch({
    candidateId: p1.candidateId,
    expectedRevision: p1.revision,
    operations: [
      {
        op: "add_bullet",
        itemId: workItemId,
        binding: createBinding(snapshot, "work-b", FIRST_QUOTE),
      },
    ],
  });
  const added = p2.structure.sections
    .flatMap((section) => section.items)
    .flatMap((item) => item.bullets);
  assert.ok(
    added.some((bullet) => bullet.text.includes("清洗运营数据")),
    "普通 bullet 应能引用技能区 bullet 已用的同一证据区间",
  );
});

test("skill bullet replace may reuse a range reserved by a normal bullet", async () => {
  const { snapshot, patcher, prepared, skillsItemId, workItemId } =
    await createInitial();
  // 普通 bullet 引用句 1（独占）
  const p1 = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: workItemId,
        binding: createBinding(snapshot, "work-b", FIRST_QUOTE),
      },
    ],
  });
  // 技能区 bullet 引用同一句 1：soft evidence 允许共享，不应被拒
  const p2 = await patcher.patch({
    candidateId: p1.candidateId,
    expectedRevision: p1.revision,
    operations: [
      {
        op: "add_bullet",
        itemId: skillsItemId,
        binding: createBinding(snapshot, "skill-b", FIRST_QUOTE),
      },
    ],
  });
  assert.ok(
    p2.bindings
      .filter((binding) => binding.sharedEvidence)
      .some((binding) => binding.bulletText.includes("清洗运营数据")),
    "技能区 bullet 应保留 sharedEvidence 并可共享普通 bullet 的区间",
  );
});

test("range-conflict rejection names reserving bullets and remaining capacity", async () => {
  const { snapshot, patcher, prepared, workItemId } = await createInitial();
  // 占满 work-1 的三句证据
  const p1 = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: workItemId,
        binding: createBinding(snapshot, "b1", FIRST_QUOTE),
      },
    ],
  });
  const p2 = await patcher.patch({
    candidateId: p1.candidateId,
    expectedRevision: p1.revision,
    operations: [
      {
        op: "add_bullet",
        itemId: workItemId,
        binding: createBinding(snapshot, "b2", SECOND_QUOTE),
      },
    ],
  });
  const p3 = await patcher.patch({
    candidateId: p2.candidateId,
    expectedRevision: p2.revision,
    operations: [
      {
        op: "add_bullet",
        itemId: workItemId,
        binding: createBinding(snapshot, "b3", THIRD_QUOTE),
      },
    ],
  });
  // 新 bullet 引用句 1：与 b1 冲突；句 2/句 3 分别被 b2/b3 占用且无自身旧
  // 引用可逃生 → 拒绝信息必须给出逃生方向（缺陷 B）
  await assert.rejects(
    patcher.patch({
      candidateId: p3.candidateId,
      expectedRevision: p3.revision,
      operations: [
        {
          op: "add_bullet",
          itemId: workItemId,
          binding: createBinding(snapshot, "b4", FIRST_QUOTE),
        },
      ],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ResumeWorkspaceError);
      assert.match(error.message, /reserved by bullets \[/);
      assert.match(error.message, /no unused evidence remains/);
      assert.match(error.message, /remove or rewrite the conflicting bullet/);
      return true;
    },
  );
});
