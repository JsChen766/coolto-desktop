import assert from "node:assert/strict";
import test from "node:test";

import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { allEvidenceCandidates } from "../src/resume/quality/evidence-candidates.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";
import { ParallelBulletWriter } from "../src/resume/planning/parallel-writer.js";
import { validateBulletText } from "../src/resume/planning/parallel-writer.js";
import type { BulletWritingRequest } from "../src/resume/planning/parallel-writer.js";
import { planResumeWriting } from "../src/resume/planning/planner.js";
import { PlannedResumeWriter } from "../src/resume/planning/planned-resume-writer.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";

const PARAMETERS = {
  charsPerLine: 55,
  lineHeightPx: 15.34,
  availableHeightPx: 1054,
  fixedLines: 17,
};

function fakeModel() {
  return { id: "fake" } as never;
}

function fakeStreamFn() {
  return (() => {
    throw new Error("LLM stream must not be called in tests");
  }) as never;
}

function fakeWriter(requests: readonly BulletWritingRequest[]) {
  return new ParallelBulletWriter({
    model: fakeModel(),
    streamFn: fakeStreamFn(),
    requestText: (request) => {
      const source = request.evidence
        .map((candidate) => candidate.sourceQuote)
        .join("");
      const filler = request.language === "zh-CN" ? "推进项目落地并沉淀可复用方法论，" : " and delivered measurable impact, ";
      const text = `${source}${filler}`;
      const gap = Math.max(0, request.targetChars.min - [...text].length + 10);
      const sentences = [
        "完成数据清洗与字段映射，",
        "建立异常检查与抽样复核规则，",
        "沉淀可复用的处理流程，",
        "配合团队完成月度复盘，",
      ];
      const tail = Array.from(
        { length: Math.ceil(gap / 16) },
        (_, index) => sentences[index % sentences.length],
      ).join("");
      void requests;
      return Promise.resolve(text + tail);
    },
  });
}

test("validateBulletText accepts in-target bullets and rejects short ones", () => {
  const request = {
    bulletIndex: 0,
    itemId: "item-w",
    experienceId: "work-1",
    evidence: [
      {
        evidenceId: "work-1:0:19",
        sourceQuote: "使用 Python 清洗运营数据产品。",
        matchedRequirementIds: [],
      },
    ] as never,
    targetChars: { min: 92, max: 165 },
    language: "zh-CN" as const,
  };
  assert.equal(validateBulletText("太短", request), "length 2 outside target 92-165");
  const inTarget = `基于 Python 完成数据清洗，建立字段映射与抽样复核规则，沉淀可复用的处理流程，配合团队完成月度复盘并支撑多轮迭代，同时输出标准化文档供业务方直接使用。`;
  assert.equal(validateBulletText(inTarget, request), null);
});

test("validateBulletText rejects numbers absent from the evidence", () => {
  const request = {
    bulletIndex: 0,
    itemId: "item-w",
    experienceId: "work-1",
    evidence: [
      {
        evidenceId: "work-1:0:19",
        sourceQuote: "使用 Python 清洗运营数据产品。",
        matchedRequirementIds: [],
      },
    ] as never,
    targetChars: { min: 92, max: 165 },
    language: "zh-CN" as const,
  };
  const text = `基于 Python 完成数据清洗，覆盖 ${"的".repeat(70)} 团队 99 个。`;
  assert.match(validateBulletText(text, request) ?? "", /numbers absent from evidence: 99/);
});

test("planned writer assembles a full evidence-bound workspace", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const plan = planResumeWriting(
    snapshot,
    ["edu-1", "work-1"],
    PARAMETERS,
    "zh-CN",
  );
  const requests: BulletWritingRequest[] = plan.bullets.map((bullet) => ({
    bulletIndex: bullet.bulletIndex,
    itemId: bullet.itemId,
    experienceId: bullet.experienceId,
    evidence: bullet.evidenceIds.map((evidenceId) =>
      allEvidenceCandidates(snapshot).find(
        (candidate) => candidate.evidenceId === evidenceId,
      )!,
    ),
    targetChars: bullet.targetChars,
    language: "zh-CN",
  }));
  const writer = new PlannedResumeWriter({
    snapshotBuilder: builder,
    compiler,
    store,
    bulletWriter: fakeWriter(requests),
  });
  const result = await writer.write({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
  });
  assert.ok(
    result.workspace.bindings.length >= plan.bullets.length,
    `expected at least ${plan.bullets.length} bindings, got ${result.workspace.bindings.length}`,
  );
  assert.ok(
    result.workspace.bindings.every(
      (binding) => binding.bulletText.length >= 30,
    ),
    "every bullet has text",
  );
  const skillsSection = result.workspace.structure.sections.find(
    (section) => section.type === "skills",
  );
  assert.ok(skillsSection, "skills section is always present");
  assert.ok(
    skillsSection.items.some(
      (item) => item.bullets.length > 0,
    ),
    "skill items carry bullets",
  );
  assert.ok(result.workspace.compileResult);
});

test("planned writer reports exhaustion instead of silently running", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const writer = new PlannedResumeWriter({
    snapshotBuilder: builder,
    compiler,
    store,
    bulletWriter: fakeWriter([]),
    listAdditionalExperiences: async () => [],
  });
  await assert.rejects(
    writer.write({
      jdId: "jd-1",
      experienceIds: ["edu-1", "work-1"],
      language: "zh-CN",
    }),
    /材料不足以生成满足门槛的简历/,
  );
});

test("preparer default maxBulletLines is three lines", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store);
  const workspace = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
  });
  assert.equal(workspace.maxBulletLines, 3);
});

test("ai layout validation accepts a valid layout and builds the plan", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const candidates = allEvidenceCandidates(snapshot);
  const workEvidence = candidates
    .filter((candidate) => candidate.experienceId === "work-1")
    .map((candidate) => candidate.evidenceId);
  const eduEvidence = candidates
    .filter((candidate) => candidate.experienceId === "edu-1")
    .map((candidate) => candidate.evidenceId);
  const { validateAndPlanLayout } = await import(
    "../src/resume/planning/ai-layout.js"
  );
  const result = validateAndPlanLayout(
    snapshot,
    [
      { experienceId: "work-1", bullets: [{ evidenceIds: workEvidence }] },
      { experienceId: "edu-1", bullets: [{ evidenceIds: eduEvidence }] },
    ],
    PARAMETERS,
    "zh-CN",
  );
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.ok(result.plan && result.plan.bullets.length >= 2);
});

test("ai layout validation rejects overlapping evidence and over-budget layouts", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const snapshot = await builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const candidates = allEvidenceCandidates(snapshot);
  const workEvidence = candidates
    .filter((candidate) => candidate.experienceId === "work-1")
    .map((candidate) => candidate.evidenceId);
  const { validateAndPlanLayout } = await import(
    "../src/resume/planning/ai-layout.js"
  );
  const overlap = validateAndPlanLayout(
    snapshot,
    [
      {
        experienceId: "work-1",
        bullets: [
          { evidenceIds: workEvidence.slice(0, 1) },
          { evidenceIds: workEvidence.slice(0, 1) },
        ],
      },
    ],
    PARAMETERS,
    "zh-CN",
  );
  assert.equal(overlap.ok, false);
  assert.ok(
    overlap.errors.some((error) => error.includes("overlaps")),
    overlap.errors.join("; "),
  );

  const overBudget = validateAndPlanLayout(
    snapshot,
    [
      {
        experienceId: "work-1",
        bullets: [
          { evidenceIds: workEvidence.slice(0, 1), targetLines: 3 },
          { evidenceIds: workEvidence.slice(1, 2), targetLines: 3 },
          { evidenceIds: workEvidence.slice(2, 3), targetLines: 3 },
        ],
      },
    ],
    { ...PARAMETERS, availableHeightPx: 200, fixedLines: 5 },
    "zh-CN",
  );
  assert.equal(overBudget.ok, false);
  assert.ok(
    overBudget.errors.some((error) => error.includes("exceeding")),
    overBudget.errors.join("; "),
  );
});
