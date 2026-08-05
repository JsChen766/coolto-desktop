import assert from "node:assert/strict";
import test from "node:test";

import { EvidenceValidationError } from "../src/resume/evidence-validation.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { buildModelPayload } from "../src/resume/workspace/model-payload.js";
import { resolveBindingWithAutoRepair } from "../src/resume/workspace/evidence-auto-repair.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceError } from "../src/resume/workspace/errors.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";
import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../src/resume/source-types.js";

function createResolvedBinding(
  snapshot: ResumeSourceSnapshot,
  bulletId: string,
  sourceQuote: string,
): BulletEvidenceBinding {
  const candidate = createBinding(snapshot, bulletId, sourceQuote);
  const input = { bulletText: sourceQuote, evidenceIds: [...candidate.evidenceIds] };
  return resolveBindingWithAutoRepair(snapshot, input, bulletId, new Map()).binding;
}

const FIRST_QUOTE = "使用 Python 清洗运营数据产品。";
const SECOND_QUOTE = "为 3 个团队建立周度报表。";

test("auto-repair adds number-covering evidence to the same bullet", async () => {
  const { patcher, prepared, snapshot } = await createInitial();
  const patched = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: {
          bulletText: "为 3 个团队清洗运营数据产品。",
          evidenceIds: [createBinding(snapshot, "ignored", FIRST_QUOTE).evidenceIds[0]!],
        },
      },
    ],
  });
  const binding = patched.bindings.find((candidate) => candidate.bulletId === "bl-0")!;
  assert.ok(
    binding.excerpts.some((excerpt) => excerpt.sourceQuote.includes("3 个团队")),
    "number-covering evidence is merged in",
  );
  assert.deepEqual(patched.lastOperationReport?.repairs.map((repair) => [
    repair.kind,
    repair.action,
  ]), [["number_coverage", "added"]]);
});

test("auto-repair refuses numbers that no unused source text contains", async () => {
  const { patcher, prepared, snapshot } = await createInitial();
  await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", FIRST_QUOTE),
      },
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-2", SECOND_QUOTE),
      },
    ],
  });
  await assert.rejects(
    patcher.patch({
      candidateId: prepared.candidateId,
      expectedRevision: 1,
      operations: [
        {
          op: "add_bullet",
          itemId: "item-work-1",
          binding: {
            bulletText: "为 3 个团队建立周度报表，并清洗数据。",
            evidenceIds: [createBinding(snapshot, "ignored", FIRST_QUOTE).evidenceIds[0]!],
          },
        },
      ],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "invalid_patch_operation" &&
      error.message.includes("Remove the number"),
  );
});

test("auto-repair keeps excerpts within the eight-excerpt cap", async () => {
  const { patcher, prepared, snapshot } = await createInitial();
  const longText =
    "为 3 个团队建立周度报表，清洗运营数据产品，并设计异常检查规则。";
  const patched = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: {
          bulletText: longText,
          evidenceIds: Array.from(
            { length: 8 },
            () => createBinding(snapshot, "ignored", FIRST_QUOTE).evidenceIds[0]!,
          ),
        },
      },
    ],
  });
  const binding = patched.bindings.find((candidate) => candidate.bulletId === "bl-0")!;
  assert.ok(binding.excerpts.length <= 8);
});

test("prepare is non-atomic: valid initial bindings land, invalid ones are reported", async () => {
  const { builder, preparer } = createServices();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const workspace = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
    initialBindings: [
      {
        bulletText: FIRST_QUOTE,
        evidenceIds: [createBinding(snapshot, "ignored", FIRST_QUOTE).evidenceIds[0]!],
      },
      {
        bulletText: "覆盖 99 个不存在的团队",
        evidenceIds: [createBinding(snapshot, "ignored", FIRST_QUOTE).evidenceIds[0]!],
      },
    ],
  });
  assert.equal(workspace.status, "writing");
  assert.equal(workspace.bindings.length, 1);
  assert.deepEqual(
    workspace.lastOperationReport?.rejected.map((rejected) => rejected.index),
    [1],
  );
});

test("append_text merges and auto-repairs the combined binding", async () => {
  const { patcher, prepared, snapshot } = await createInitial();
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
  const extended = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      {
        op: "append_text",
        bulletId: "bl-0",
        text: SECOND_QUOTE,
        evidenceIds: [createBinding(snapshot, "ignored", FIRST_QUOTE).evidenceIds[0]!],
      },
    ],
  });
  const binding = extended.bindings.find((candidate) => candidate.bulletId === "bl-0")!;
  assert.ok(
    binding.excerpts.some((excerpt) => excerpt.sourceQuote.includes("3 个团队")),
    "merged binding gains number-covering evidence",
  );
});

test("prepare accumulates the work map so later initial bindings avoid conflicts", async () => {
  const { builder, preparer } = createServices();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const first = createBinding(snapshot, "ignored", FIRST_QUOTE).evidenceIds[0]!;
  const workspace = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
    initialBindings: [
      { bulletText: FIRST_QUOTE, evidenceIds: [first] },
      { bulletText: FIRST_QUOTE + SECOND_QUOTE, evidenceIds: [first] },
    ],
  });
  assert.equal(workspace.bindings.length, 2);
  const second = workspace.bindings.find((binding) => binding.bulletId === "bl-1")!;
  assert.ok(
    !second.excerpts.some(
      (excerpt) => excerpt.sourceQuote === FIRST_QUOTE && excerpt.sourceStart === 0,
    ),
    "second binding swapped away from the reserved range",
  );
  assert.deepEqual(
    workspace.lastOperationReport?.repairs.map((repair) => repair.kind),
    ["range_conflict"],
  );
});

test("fabricated evidence ids are replaced with unused same-experience candidates", async () => {
  const { patcher, prepared, snapshot } = await createInitial();
  const patched = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: {
          bulletText: "为 3 个团队建立周度报表。",
          evidenceIds: ["work-1:999:1005"],
        },
      },
    ],
  });
  const binding = patched.bindings.find((candidate) => candidate.bulletId === "bl-0")!;
  assert.ok(
    binding.excerpts.some((excerpt) => excerpt.sourceQuote.includes("3 个团队")),
    "replacement quote covers the bullet text",
  );
  assert.deepEqual(
    patched.lastOperationReport?.repairs.map((repair) => repair.kind),
    ["unknown_evidence_id", "number_coverage"],
  );
});

test("fabricated evidence ids still fail when no same-experience candidate remains", async () => {
  const { patcher, prepared } = await createInitial();
  await assert.rejects(
    patcher.patch({
      candidateId: prepared.candidateId,
      expectedRevision: 0,
      operations: [
        {
          op: "add_bullet",
          itemId: "item-work-1",
          binding: {
            bulletText: "任意内容",
            evidenceIds: ["exp-does-not-exist:1:2"],
          },
        },
      ],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "invalid_patch_operation" &&
      error.message.includes("copy evidenceId values verbatim"),
  );
});

test("write plan reports unused evidence counts per item", async () => {
  const { builder, preparer } = createServices();
  const workspace = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
  });
  const plan = (
    buildModelPayload(workspace) as { writePlan: Array<Record<string, unknown>> }
  ).writePlan;
  const workItem = plan.find((item) => item.itemId === "item-work-1")!;
  assert.equal(typeof workItem.unusedEvidenceCount, "number");
  assert.ok((workItem.unusedEvidenceCount as number) >= 2);
  assert.ok((workItem.missing as number) >= 3);
});

test("range-conflict repair never maps two excerpts to the same candidate", async () => {
  const { snapshot } = await createInitial();
  const firstId = createBinding(snapshot, "i", FIRST_QUOTE).evidenceIds[0]!;
  const secondId = createBinding(snapshot, "i", SECOND_QUOTE).evidenceIds[0]!;
  const occupied = new Map([
    ["bl-1", createResolvedBinding(snapshot, "bl-1", FIRST_QUOTE)],
    ["bl-2", createResolvedBinding(snapshot, "bl-2", SECOND_QUOTE)],
  ]);
  assert.throws(
    () =>
      resolveBindingWithAutoRepair(
        snapshot,
        {
          bulletText: FIRST_QUOTE + SECOND_QUOTE,
          evidenceIds: [firstId, secondId],
        },
        "bl-0",
        occupied,
      ),
    (error: unknown) =>
      error instanceof EvidenceValidationError &&
      error.code === "duplicate_source_range" &&
      error.message.includes("no unused evidence remains"),
  );
});

test("range-conflict repair keeps distinct ranges when alternatives exist", async () => {
  const { snapshot } = await createInitial();
  const secondId = createBinding(snapshot, "i", SECOND_QUOTE).evidenceIds[0]!;
  const thirdId = createBinding(snapshot, "i", "设计异常检查规则并与业务团队协作。").evidenceIds[0]!;
  const occupied = new Map([
    ["bl-1", createResolvedBinding(snapshot, "bl-1", SECOND_QUOTE)],
  ]);
  const { binding } = resolveBindingWithAutoRepair(
    snapshot,
    {
      bulletText: "设计异常检查规则并与业务团队协作。",
      evidenceIds: [secondId, thirdId],
    },
    "bl-0",
    occupied,
  );
  const ranges = binding.excerpts.map(
    (excerpt) => `${excerpt.sourceStart}:${excerpt.sourceEnd}`,
  );
  assert.equal(new Set(ranges).size, ranges.length, `no duplicate ranges: ${ranges}`);
  assert.ok(ranges.some((range) => range === "33:50"), "third quote kept");
});

async function createInitial() {
  const { builder, preparer, patcher, compiler, store } = createServices();
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

function createServices() {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "auto-repair-test",
  });
  return {
    builder,
    compiler,
    store,
    preparer,
    patcher: new ResumeCandidatePatcher(compiler, store),
  };
}
