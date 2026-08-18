import assert from "node:assert/strict";
import test from "node:test";

import { EvidenceValidationError } from "../src/resume/evidence-ledger.js";
import { allEvidenceCandidates } from "../src/resume/quality/evidence-candidates.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceError } from "../src/resume/workspace/errors.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

const FIRST_QUOTE = "使用 Python 清洗运营数据产品。";
const SECOND_QUOTE = "为 3 个团队建立周度报表。";
const THIRD_QUOTE = "设计异常检查规则并与业务团队协作。";

function stripped(text: string): string {
  return text.replace(/[\s。．.！!？?；;]+$/u, "");
}

/** Merges append-style text: the original bullet was normalized at add
 * time (trailing period stripped); appended parts keep their own internal
 * punctuation and only the final result is stripped at the end. */
function appendedText(original: string, ...parts: string[]): string {
  return stripped(stripped(original) + parts.join(""));
}



async function createInitial() {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "incremental-test",
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
  return { snapshot, patcher, prepared };
}

test("append_text extends a bullet and merges its evidence", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  const patched = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
    ],
  });
  const extended = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      {
        op: "append_text",
        bulletId: "bl-0",
        text: SECOND_QUOTE,
        evidenceIds: [
          createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!,
        ],
      },
    ],
  });
  const bullet = extended.structure.sections[1]!.items[0]!.bullets[0]!;
  assert.equal(bullet.text, appendedText(FIRST_QUOTE, SECOND_QUOTE));
  const binding = extended.bindings.find((candidate) => candidate.bulletId === "bl-0")!;
  assert.equal(binding.excerpts.length, 2);
  assert.equal(binding.bulletText, appendedText(FIRST_QUOTE, SECOND_QUOTE));
});

test("prepend_text and insert_text edit in place", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
    ],
  });
  const secondEvidence = createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!;
  const thirdEvidence = createBinding(snapshot, "ignored", THIRD_QUOTE).evidenceIds[0]!;
  const edited = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      { op: "prepend_text", bulletId: "bl-0", text: SECOND_QUOTE, evidenceIds: [secondEvidence] },
      {
        op: "insert_text",
        bulletId: "bl-0",
        after: SECOND_QUOTE,
        text: THIRD_QUOTE,
        evidenceIds: [thirdEvidence],
      },
    ],
  });
  assert.equal(
    edited.structure.sections[1]!.items[0]!.bullets[0]!.text,
    stripped(SECOND_QUOTE + THIRD_QUOTE + FIRST_QUOTE),
  );
});

test("insert_text rejects missing and ambiguous anchors", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  const firstEvidence = createBinding(snapshot, "ignored", FIRST_QUOTE).evidenceIds[0]!;
  const thirdEvidence = createBinding(snapshot, "ignored", THIRD_QUOTE).evidenceIds[0]!;
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: {
          bulletText: FIRST_QUOTE + "Python 设计异常检查规则。",
          evidenceIds: [firstEvidence, thirdEvidence],
        },
      },
    ],
  });
  const evidence = createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!;
  await assert.rejects(
    patcher.patch({
      candidateId: prepared.candidateId,
      expectedRevision: 1,
      operations: [
        { op: "insert_text", bulletId: "bl-0", after: "不存在的锚点", text: "x", evidenceIds: [evidence] },
      ],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "invalid_patch_operation" &&
      error.message.includes("does not appear in bullet text"),
  );
  await assert.rejects(
    patcher.patch({
      candidateId: prepared.candidateId,
      expectedRevision: 1,
      operations: [
        { op: "insert_text", bulletId: "bl-0", after: "Python", text: "x", evidenceIds: [evidence] },
      ],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "invalid_patch_operation" &&
      error.message.includes("copy a longer unique substring"),
  );
  assert.equal((await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      { op: "insert_text", bulletId: "bl-0", after: "。Python", text: "指标", evidenceIds: [evidence] },
    ],
  })).revision, 2);
});

test("replace_substring swaps or deletes a unique substring", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
    ],
  });
  const evidence = createBinding(snapshot, "ignored", THIRD_QUOTE).evidenceIds[0]!;
  const swapped = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      { op: "replace_substring", bulletId: "bl-0", from: "运营数据产品", to: "数据产品", evidenceIds: [evidence] },
    ],
  });
  assert.equal(swapped.structure.sections[1]!.items[0]!.bullets[0]!.text, "使用 Python 清洗数据产品");
});

test("trim_text shortens to keepChars without touching evidence", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  const firstEvidence = createBinding(snapshot, "ignored", FIRST_QUOTE).evidenceIds[0]!;
  const secondEvidence = createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!;
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: {
          bulletText: FIRST_QUOTE + SECOND_QUOTE,
          evidenceIds: [firstEvidence, secondEvidence],
        },
      },
    ],
  });
  const trimmed = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [{ op: "trim_text", bulletId: "bl-0", keepChars: 8 }],
  });
  assert.equal(trimmed.structure.sections[1]!.items[0]!.bullets[0]!.text, "使用 Pytho");
  const binding = trimmed.bindings.find((candidate) => candidate.bulletId === "bl-0")!;
  assert.equal(binding.excerpts.length, 2);
});

test("incremental evidence must belong to the bullet's own experience", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
    ],
  });
  const foreignEvidence = allEvidenceForEducation(snapshot);
  await assert.rejects(
    patcher.patch({
      candidateId: prepared.candidateId,
      expectedRevision: 1,
      operations: [
        { op: "append_text", bulletId: "bl-0", text: "跨经历", evidenceIds: [foreignEvidence] },
      ],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "invalid_patch_operation" &&
      error.message.includes("cites evidence from"),
  );
});

test("merged bullet numbers must be supported by the merged evidence", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
    ],
  });
  const evidence = createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!;
  await assert.rejects(
    patcher.patch({
      candidateId: prepared.candidateId,
      expectedRevision: 1,
      operations: [
        { op: "append_text", bulletId: "bl-0", text: "覆盖 99 个团队", evidenceIds: [evidence] },
      ],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "invalid_patch_operation" &&
      error.message.includes("99"),
  );
});

test("a failing operation does not roll back the rest of the batch", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
    ],
  });
  const evidence = createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!;
  const partial = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      { op: "append_text", bulletId: "bl-0", text: SECOND_QUOTE, evidenceIds: [evidence] },
      { op: "append_text", bulletId: "bl-0", text: "含有 99 个不存在的数字", evidenceIds: [evidence] },
    ],
  });
  assert.equal(partial.revision, 2);
  assert.equal(
    partial.structure.sections[1]!.items[0]!.bullets[0]!.text,
    appendedText(FIRST_QUOTE, SECOND_QUOTE),
  );
  assert.deepEqual(
    partial.lastOperationReport?.rejected.map((rejected) => rejected.index),
    [1],
  );
  assert.deepEqual(
    {
      status: partial.lastOperationReport?.status,
      attempted: partial.lastOperationReport?.attempted,
      applied: partial.lastOperationReport?.applied,
    },
    { status: "partial_success", attempted: 2, applied: 1 },
  );
  assert.match(
    partial.lastOperationReport?.rejected[0]?.message ?? "",
    /99/,
  );
  const workspace = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 2,
    operations: [{ op: "remove_bullet", bulletId: "bl-0" }],
  });
  assert.equal(workspace.structure.sections[1]!.items[0]!.bullets.length, 0);
});

test("append_text absorbs an overlapping tail extension instead of rejecting", async () => {
  // The tail pass re-sends whole sentences whose head is already the bullet's
  // tail ("…提供全面的技术支撑" + "，为…提供全面的技术支撑与工程保障").
  // The host appends only the non-overlapping remainder; rejecting would make
  // the model retry the identical append forever (stuck bl-0 loop).
  const { snapshot, patcher, prepared } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
    ],
  });
  const evidence = createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!;
  const extended = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      {
        op: "append_text",
        bulletId: "bl-0",
        text: `，${FIRST_QUOTE}并沉淀为团队知识库。`,
        evidenceIds: [evidence],
      },
    ],
  });
  const bullet = extended.structure.sections[1]!.items[0]!.bullets[0]!;
  assert.equal(bullet.text, stripped(FIRST_QUOTE + "并沉淀为团队知识库。"));
  assert.equal(extended.lastOperationReport?.status, "success");
});

test("append_text fully absorbed by the bullet is rejected with a clear already-present message", async () => {
  // The model re-sends a sentence already present verbatim at the tail.
  // 此前"成功 no-op"会让模型误以为补长生效（revision 涨但内容不变，
  // usage 卡死 → 补长空转）；改为明确拒绝并告知文本已存在，引导改补别处。
  const { snapshot, patcher, prepared } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
    ],
  });
  const evidence = createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!;
  // 追加文本与现有尾部完全重叠（bullet 尾部 10 字符原样重发 → 被吸收）
  await assert.rejects(
    patcher.patch({
      candidateId: prepared.candidateId,
      expectedRevision: 1,
      operations: [
        {
          op: "append_text",
          bulletId: "bl-0",
          text: stripped(FIRST_QUOTE).slice(-10),
          evidenceIds: [evidence],
        },
      ],
    }),
    /already contains the text you tried to add/,
  );
});

test("append_text rejects text that repeats content already inside the bullet", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
    ],
  });
  const evidence = createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!;
  const partial = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      { op: "append_text", bulletId: "bl-0", text: THIRD_QUOTE, evidenceIds: [evidence] },
      { op: "append_text", bulletId: "bl-0", text: FIRST_QUOTE, evidenceIds: [evidence] },
    ],
  });
  assert.equal(
    partial.structure.sections[1]!.items[0]!.bullets[0]!.text,
    appendedText(FIRST_QUOTE, THIRD_QUOTE),
  );
  assert.deepEqual(
    partial.lastOperationReport?.rejected.map((rejected) => rejected.index),
    [1],
  );
  assert.match(
    partial.lastOperationReport?.rejected[0]?.message ?? "",
    /repeated fragment/,
  );
});

test("append_text rejects wording already used by another bullet", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(
          snapshot,
          "bullet-1",
          FIRST_QUOTE,
          FIRST_QUOTE + "建立周报机制并归档复盘沉淀流程以提升协作效率。",
        ),
      },
    ],
  });
  const secondEvidence = createBinding(snapshot, "ignored", SECOND_QUOTE).evidenceIds[0]!;
  const partial = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-2", SECOND_QUOTE),
      },
      { op: "append_text", bulletId: "bl-1", text: "建立周报机制并归档复盘沉淀流程以提升协作效率。", evidenceIds: [secondEvidence] },
    ],
  });
  assert.equal(
    partial.structure.sections[1]!.items[0]!.bullets[1]!.text,
    stripped(SECOND_QUOTE),
  );
  assert.deepEqual(
    partial.lastOperationReport?.rejected.map((rejected) => rejected.index),
    [1],
  );
  assert.match(
    partial.lastOperationReport?.rejected[0]?.message ?? "",
    /already used in another bullet/,
  );
});

test("回归：既有 bullet 之间的重复不阻塞无关 append，新碰撞仍拒绝", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  const SHARED = "并建立覆盖全生命周期的风险监控与预警体系";
  const seeded = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(
          snapshot,
          "b0",
          FIRST_QUOTE,
          `使用 Python 清洗运营数据产品，${SHARED}。`,
        ),
      },
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(
          snapshot,
          "b1",
          SECOND_QUOTE,
          `为 3 个团队建立周度报表，${SHARED}。`,
        ),
      },
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(
          snapshot,
          "b2",
          THIRD_QUOTE,
          "设计异常检查规则并与业务团队协作，沉淀可复用的处理流程。",
        ),
      },
    ],
  });
  assert.equal(seeded.revision, 1);
  // 无关 append：bl-0/bl-1 之间既有的重复不得阻塞对 bl-2 的补长
  // （真实日志：bl-0 尾行修复被 bl-4 里既有的重复短语误报拒绝 → 永久锁死）
  const unrelated = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      {
        op: "append_text",
        bulletId: "bl-2",
        text: "，并持续支撑多轮迭代交付",
        evidenceIds: [],
      },
    ],
  });
  assert.equal(unrelated.revision, 2);
  assert.match(
    unrelated.structure.sections[1]!.items[0]!.bullets[2]!.text,
    /持续支撑多轮迭代交付/,
  );
  // 真实碰撞：本条 append 引入了与既有 bullet 相同的片段 → 仍拒绝
  await assert.rejects(
    patcher.patch({
      candidateId: prepared.candidateId,
      expectedRevision: 2,
      operations: [
        {
          op: "append_text",
          bulletId: "bl-2",
          text: `，${SHARED}`,
          evidenceIds: [],
        },
      ],
    }),
    /would repeat wording/,
  );
});

test("回归：技能区 bullet 允许跨经历引用证据（append 不再误拒）", async () => {
  const { snapshot, patcher, prepared } = await createInitial();
  const workEvidence = allEvidenceCandidates(snapshot).find(
    (candidate) => candidate.experienceId === "work-1",
  )!.evidenceId;
  const eduEvidence = allEvidenceCandidates(snapshot).find(
    (candidate) => candidate.experienceId === "edu-1",
  )!.evidenceId;
  const seeded = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-skills-synthetic",
        binding: {
          bulletText: "具备高效的数据处理与财务分析能力",
          evidenceIds: [workEvidence],
        },
      },
    ],
  });
  // 技能区 append 引用另一条经历的证据：此前 resolveExcerpts 因"多个经历"
  // 直接拒绝，模型无法修复该 bullet 并陷入修订混乱循环（真实日志 b9）。
  const patched = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      {
        op: "append_text",
        bulletId: "bl-0",
        text: "，支持复杂数据的快速处理与可视化呈现",
        evidenceIds: [eduEvidence],
      },
    ],
  });
  assert.equal(patched.revision, 2);
  assert.match(
    patched.structure.sections[2]!.items[0]!.bullets[0]!.text,
    /可视化呈现/,
  );
});

function allEvidenceForEducation(snapshot: Parameters<typeof createBinding>[0]): string {
  return allEvidenceCandidates(snapshot).find(
    (candidate) => candidate.experienceId === "edu-1",
  )!.evidenceId;
}
