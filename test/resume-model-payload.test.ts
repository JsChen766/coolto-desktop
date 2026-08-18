import assert from "node:assert/strict";
import test from "node:test";

import { projectResumeSourceSnapshot } from "../src/resume/source-projection.js";
import { buildModelPayload } from "../src/resume/workspace/model-payload.js";
import { projectResumeWorkspace } from "../src/resume/workspace/workspace-projection.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";

const prepareInput = {
  jdId: "jd-1",
  experienceIds: ["edu-1", "work-1"],
  language: "zh-CN" as const,
};

test("model payload keeps only what the model writes from", async () => {
  const { builder, preparer, patcher } = createServices();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
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

  const payload = buildModelPayload(qualified) as Record<string, any>;
  const full = projectResumeWorkspace(qualified) as Record<string, any>;

  assert.equal(payload.candidateId, "candidate-test");
  assert.equal(payload.revision, 1);
  assert.equal(payload.status, "layout_qualified");
  assert.deepEqual(payload.continuation, { continuable: true, reason: null });
  assert.deepEqual(
    {
      status: payload.operationOutcome.status,
      attempted: payload.operationOutcome.attempted,
      applied: payload.operationOutcome.applied,
    },
    { status: "success", attempted: 2, applied: 2 },
  );
  assert.match(payload.visibleText, /教育经历[\s\S]*工作经历/);
  assert.ok(payload.structure.sections, "structure id index present");
  assert.ok(Array.isArray(payload.writePlan));
  assert.ok(
    payload.instruction.includes("quality review"),
    `instruction guides the host review: ${payload.instruction}`,
  );
  assert.equal(typeof payload.budget.pxToMinimum, "number");
  assert.equal(typeof payload.overflowDiagnostic, "object");
  assert.ok(Array.isArray(payload.bulletTailDiagnostics));

  const bindingIds = (payload.evidenceBindings as Array<{
    bulletId: string;
    evidenceIds: string[];
  }>).flatMap((binding) => binding.evidenceIds);
  assert.deepEqual(bindingIds, ["work-1:0:19", "work-1:19:33"]);
  assert.equal(
    JSON.stringify(payload.evidenceBindings).includes('"sourceQuote"'),
    false,
    "model payload must not resend binding excerpts",
  );
  assert.equal(
    JSON.stringify(payload).includes('"valueScore"'),
    false,
    "model payload must not carry candidate scoring internals",
  );
  assert.equal(
    JSON.stringify(payload).includes('"revisionContentHash"'),
    false,
  );
  assert.equal(
    JSON.stringify(payload.compile).includes("lastLineWidthPx"),
    false,
    "model payload must not carry raw bullet measurements",
  );

  const candidate = (payload.availableEvidence as Array<Record<string, unknown>>)[0];
  assert.deepEqual(Object.keys(candidate ?? {}).sort(), [
    "evidenceId",
    "matchedRequirementIds",
    "sourceQuote",
  ]);

  const fullBinding = (full.evidenceBindings as Array<{ excerpts: unknown[] }>)[0];
  assert.ok(fullBinding, "full projection keeps bindings");
  assert.ok(Array.isArray(fullBinding.excerpts), "full projection keeps excerpts");
});

test("snapshot projection slims candidates and caps JD raw text", async () => {
  const { builder } = createServices();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const withLongJd = {
    ...snapshot,
    jd: { ...snapshot.jd, rawText: "岗位要求描述。".repeat(300) },
  } as typeof snapshot;

  const projection = projectResumeSourceSnapshot(withLongJd) as {
    availableEvidence: Array<Record<string, unknown>>;
    jd: { rawText: string };
  };
  assert.deepEqual(Object.keys(projection.availableEvidence[0] ?? {}).sort(), [
    "evidenceId",
    "matchedRequirementIds",
    "sourceQuote",
  ]);
  assert.equal(
    [...projection.jd.rawText].slice(0, 800).join(""),
    "岗位要求描述。".repeat(300).slice(0, 800),
  );
  assert.match(projection.jd.rawText, /原文已截断/);
});

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
