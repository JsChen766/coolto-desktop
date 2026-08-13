import assert from "node:assert/strict";
import test from "node:test";

import { EvidenceValidationError } from "../src/resume/evidence-ledger.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceError } from "../src/resume/workspace/errors.js";
import { projectResumeWorkspace } from "../src/resume/workspace/workspace-projection.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

test("preparer creates the fixed resume skeleton and returns a real pixel budget", async () => {
  const { preparer, compiler } = createServices();
  const workspace = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["work-1", "edu-1"],
    language: "zh-CN",
  });
  const projection = projectResumeWorkspace(workspace) as Record<string, any>;

  assert.equal(workspace.candidateId, "candidate-test");
  assert.equal(workspace.status, "writing");
  assert.deepEqual(
    workspace.structure.sections.map((section) => section.heading),
    ["教育经历", "工作经历", "专业技能"],
  );
  assert.equal(workspace.structure.sections[0]?.items[0]?.id, "item-edu-1");
  assert.equal(workspace.structure.sections[1]?.items[0]?.id, "item-work-1");
  assert.equal(workspace.structure.layout_template_id, "resume-standard");
  assert.equal(compiler.structures.length, 1);
  assert.equal(projection.budget.pxToMinimum, 200);
  assert.equal(projection.budget.estimatedBodyLinesRemaining, 14);
  assert.deepEqual(projection.contentDiagnostics.unwrittenExperienceItemIds, [
    "item-work-1",
  ]);
  assert.match(projection.visibleText, /Alice Chen[\s\S]*教育经历[\s\S]*工作经历/);
  assert.match(projection.instruction, /item-work-1/);
});

test("needs_user_decision instruction explains the evidence gap and the relaxed re-selection path", async () => {
  const { builder, preparer } = createServices();
  const workspace = await preparer.prepare(prepareInput);
  const withDecision = structuredClone(workspace);
  withDecision.status = "needs_user_decision";
  const projection = projectResumeWorkspace(withDecision) as {
    instruction: string;
  };
  assert.match(projection.instruction, /修饰语改写补齐/);
  assert.match(projection.instruction, /search_experiences/);
  assert.match(projection.instruction, /不得降低任何质量门槛/);
});

test("patcher reaches qualification with grounded local patches and rejects stale writes", async () => {
  const { builder, preparer, patcher } = createServices();
  const snapshot = await buildSnapshot(builder);
  const initial = await preparer.prepare(prepareInput);
  const qualified = await patcher.patch({
    candidateId: initial.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-1", "使用 Python 清洗运营数据产品。"),
      },
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(snapshot, "bullet-2", "为 3 个团队建立周度报表。"),
      },
    ],
  });

  assert.equal(qualified.revision, 1);
  assert.equal(qualified.status, "layout_qualified");
  assert.equal(qualified.bindings.length, 2);
  assert.deepEqual(
    qualified.structure.sections[1]?.items[0]?.bullets.map((bullet) => bullet.id),
    ["bl-0", "bl-1"],
  );
  const autoRepaired = await patcher.patch({
    candidateId: initial.candidateId,
    expectedRevision: 1,
    operations: [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: createBinding(
          snapshot,
          "bullet-1",
          "使用 Python 清洗运营数据产品。",
        ),
      },
    ],
  });
  assert.equal(autoRepaired.revision, 2);
  const swapped = autoRepaired.bindings.find(
    (candidate) => candidate.bulletId === "bl-2",
  );
  assert.equal(swapped?.excerpts[0]?.sourceQuote, "设计异常检查规则并与业务团队协作。");
  assert.deepEqual(
    autoRepaired.lastOperationReport?.repairs.map((repair) => repair.kind),
    ["range_conflict"],
  );
  await assert.rejects(
    patcher.patch({
      candidateId: initial.candidateId,
      expectedRevision: 0,
      operations: [{ op: "remove_bullet", bulletId: "bl-0" }],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "stale_candidate_revision",
  );
});

test("failed evidence patches reject per operation and cannot cross experience ownership", async () => {
  const { builder, preparer, patcher, store } = createServices();
  const snapshot = await buildSnapshot(builder);
  const initial = await preparer.prepare(prepareInput);
  const invalid = {
    ...createBinding(snapshot, "bullet-invalid", "使用 Python 清洗运营数据产品。"),
    evidenceIds: ["work-1:0:0"],
  };

  await assert.rejects(
    patcher.patch({
      candidateId: initial.candidateId,
      expectedRevision: 0,
      operations: [
        { op: "add_bullet", itemId: "item-work-1", binding: invalid },
      ],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "invalid_patch_operation" &&
      error.message.includes("work-1:0:0"),
  );
  assert.equal(store.get(initial.candidateId).revision, 0);

  const wrongOwner = createBinding(
    snapshot,
    "bullet-owner",
    "使用 Python 清洗运营数据产品。",
  );
  await assert.rejects(
    patcher.patch({
      candidateId: initial.candidateId,
      expectedRevision: 0,
      operations: [
        { op: "add_bullet", itemId: "item-edu-1", binding: wrongOwner },
      ],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "invalid_patch_operation" &&
      error.message.includes("does not belong to item"),
  );
  assert.equal(store.get(initial.candidateId).bindings.length, 0);
});

test("a worse revision does not replace the best qualified candidate", async () => {
  const { builder, preparer, patcher } = createServices();
  const snapshot = await buildSnapshot(builder);
  const initial = await preparer.prepare({
    ...prepareInput,
    initialBindings: [
      createBinding(snapshot, "bullet-1", "使用 Python 清洗运营数据产品。"),
      createBinding(snapshot, "bullet-2", "为 3 个团队建立周度报表。"),
    ],
  });
  assert.equal(initial.status, "layout_qualified");

  const worse = await patcher.patch({
    candidateId: initial.candidateId,
    expectedRevision: 0,
    operations: [
      {
        op: "replace_bullet",
        bulletId: "bl-1",
        binding: createBinding(
          snapshot,
          "bullet-2",
          "为 3 个团队建立周度报表。",
          "为 3 个团队建立周度报表，短尾",
        ),
      },
    ],
  });

  assert.equal(worse.status, "needs_revision");
  assert.equal(worse.bestSnapshot.revision, 0);
  assert.equal(worse.bestSnapshot.compileResult.qualified, true);
  const projection = projectResumeWorkspace(worse) as Record<string, any>;
  assert.equal(projection.bulletTailDiagnostics[0].bulletId, "bl-1");
  assert.equal(projection.bulletTailDiagnostics[0].deficitPx, 220);
});

test("move and remove patches preserve stable IDs and evidence coverage", async () => {
  const { builder, preparer, patcher } = createServices();
  const snapshot = await buildSnapshot(builder);
  const initial = await preparer.prepare({
    ...prepareInput,
    initialBindings: [
      createBinding(snapshot, "bullet-1", "使用 Python 清洗运营数据产品。"),
      createBinding(snapshot, "bullet-2", "为 3 个团队建立周度报表。"),
    ],
  });
  const moved = await patcher.patch({
    candidateId: initial.candidateId,
    expectedRevision: 0,
    operations: [
      { op: "move_bullet", bulletId: "bl-1", afterBulletId: null },
    ],
  });
  assert.deepEqual(
    moved.structure.sections[1]?.items[0]?.bullets.map((bullet) => bullet.id),
    ["bl-1", "bl-0"],
  );

  const removed = await patcher.patch({
    candidateId: initial.candidateId,
    expectedRevision: 1,
    operations: [{ op: "remove_bullet", bulletId: "bl-0" }],
  });
  assert.deepEqual(
    removed.structure.sections[1]?.items[0]?.bullets.map((bullet) => bullet.id),
    ["bl-1"],
  );
  assert.deepEqual(removed.bindings.map((binding) => binding.bulletId), ["bl-1"]);
  assert.equal(removed.bestSnapshot.revision, 0);
});

test("prepare fails closed without required education", async () => {
  const { preparer } = createServices();
  await assert.rejects(
    preparer.prepare({
      jdId: "jd-1",
      experienceIds: ["work-1"],
      language: "zh-CN",
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError && error.code === "missing_education_source",
  );
});

const prepareInput = {
  jdId: "jd-1",
  experienceIds: ["edu-1", "work-1"],
  language: "zh-CN" as const,
};

function createServices() {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "candidate-test",
  });
  return {
    builder,
    compiler,
    store,
    preparer,
    patcher: new ResumeCandidatePatcher(compiler, store),
  };
}

function buildSnapshot(builder: ReturnType<typeof createWorkspaceSnapshotBuilder>) {
  return builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
}
