import assert from "node:assert/strict";
import test from "node:test";

import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { buildTailFillOperations } from "../src/resume/workspace/tail-fill.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

const FIRST_QUOTE = "使用 Python 清洗运营数据产品。";
const SECOND_QUOTE = "为 3 个团队建立周度报表。";
const THIRD_QUOTE = "设计异常检查规则并与业务团队协作。";

test("tail-fill is skipped without tail-deficit violations or with overflow", async () => {
  const { patcher, prepared, snapshot } = await createInitial();
  const underfilled = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: {
          bulletText: "内容不足但没有任何尾行违规的普通句子。",
          evidenceIds: [createBinding(snapshot, "i", FIRST_QUOTE).evidenceIds[0]!],
        },
      },
    ],
  });
  const operations = buildTailFillOperations(underfilled);
  assert.equal(operations.length, 0, "no tail violation means no tail fill");
});

test("patcher auto tail-fills a pure tail-deficit bullet with the next evidence sentence", async () => {
  const { patcher, prepared, snapshot } = await createInitial();
  const filled = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "b1", FIRST_QUOTE),
      },
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: {
          bulletText: "短尾内容不足以支撑页面宽度要求。",
          evidenceIds: [createBinding(snapshot, "i", SECOND_QUOTE).evidenceIds[0]!],
        },
      },
    ],
  });
  assert.equal(filled.revision, 1);
  const tailRepairs =
    filled.lastOperationReport?.repairs.filter(
      (repair) => repair.kind === "tail_fill",
    ) ?? [];
  assert.equal(tailRepairs.length, 1);
  const bullet = filled.structure.sections[1]!.items[0]!.bullets[1]!;
  assert.ok(
    bullet.text.includes(THIRD_QUOTE),
    `tail-fill appended the next evidence sentence: ${bullet.text}`,
  );
});

test("tail-fill stops after max operations per batch", async () => {
  const { patcher, prepared, snapshot } = await createInitial();
  const filled = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: {
          bulletText: "短尾甲短尾乙短尾丙。",
          evidenceIds: [createBinding(snapshot, "i", FIRST_QUOTE).evidenceIds[0]!],
        },
      },
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: {
          bulletText: "短尾丁短尾戊。",
          evidenceIds: [createBinding(snapshot, "i", SECOND_QUOTE).evidenceIds[0]!],
        },
      },
    ],
  });
  const tailRepairs =
    filled.lastOperationReport?.repairs.filter(
      (repair) => repair.kind === "tail_fill",
    ) ?? [];
  assert.ok(tailRepairs.length <= 2, `capped at two: ${tailRepairs.length}`);
});

async function createInitial() {  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "tail-fill-test",
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
  return { snapshot, patcher, prepared, compiler, store };
}
