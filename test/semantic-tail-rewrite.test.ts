import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import type { ResumeStructure } from "../src/resume/types.js";
import { processSemanticTailRewriteBatch } from
  "../src/resume/workspace/semantic-tail-rewrite-processor.js";
import { findMechanicalTailEnding } from
  "../src/resume/workspace/semantic-tail-ending.js";
import { resolveResumeContentChanges } from
  "../src/tools/agent-orchestrated/content-change-resolver.js";
import type { ResumeCompiler } from
  "../src/resume/workspace/compiler-port.js";
import type { ResumeWorkspace } from
  "../src/resume/workspace/types.js";

const CURRENT = "分析数字资产平台运营流程并梳理客户转化节点";
const NATURAL = "梳理数字资产平台客户路径，分析运营流程关键节点并提出优化清单";
const NEAR = "梳理数字资产平台客户路径，分析运营流程关键节点并形成优化清单";
const LONGER = `${NATURAL}，补充周度跟踪结果与市场范围`;
const PADDED = `${CURRENT}，保持工作脉络清晰并支持后续统一复核`;
const OTHER = "比较同业平台的产品范围并形成竞品矩阵，保持工作脉络清晰并支持后续统一复核";

test("semantic tail rewrite accepts reordered facts and selects the measured candidate", async () => {
  const compiler = new RewriteCompiler(new Map([
    [NATURAL, 0.74],
    [PADDED, 0.78],
  ]));
  const workspace = await createWorkspace(compiler);

  const result = await processSemanticTailRewriteBatch(workspace, [{
    bulletId: "a",
    candidates: [{ strategy: "compact", revisedText: NATURAL }, {
      strategy: "expand",
      revisedText: PADDED,
    }],
  }], compiler);

  assert.deepEqual(result.updates, [{
    bulletId: "a",
    text: NATURAL,
    evidenceIds: ["e-a"],
  }]);
  assert.equal(result.diagnostics.measuredCandidateCount, 1);
  assert.equal(result.diagnostics.repetitionRejectedCandidateCount, 1);
  assert.equal(compiler.compileCount, 3, "baseline, one candidate round, final combination");
});

test("semantic tail rewrite keeps the formal draft when no candidate passes", async () => {
  const compiler = new RewriteCompiler(new Map([[NATURAL, 0.3]]));
  const workspace = await createWorkspace(compiler);

  const result = await processSemanticTailRewriteBatch(workspace, [{
    bulletId: "a",
    candidates: [{ strategy: "compact", revisedText: NATURAL }],
  }], compiler);

  assert.deepEqual(result.updates, []);
  assert.equal(result.progress.byBulletId.a?.reflowAttempts, 1);
  assert.equal(workspace.structure.sections[0]?.items[0]?.bullets[0]?.text, CURRENT);
});

test("the closest valid rewrite becomes a non-formal baseline for the second round", async () => {
  const compiler = new RewriteCompiler(new Map([[NEAR, 0.64]]));
  const workspace = await createWorkspace(compiler);

  const result = await processSemanticTailRewriteBatch(workspace, [{
    bulletId: "a",
    candidates: [{ strategy: "expand", revisedText: NEAR }],
  }], compiler);

  assert.deepEqual(result.updates, []);
  assert.equal(result.progress.byBulletId.a?.workingText, NEAR);
  assert.equal(result.progress.byBulletId.a?.workingLastLineRatio, 0.64);
  assert.equal(result.progress.byBulletId.a?.reflowAttempts, 0);
  assert.equal(workspace.structure.sections[0]?.items[0]?.bullets[0]?.text, CURRENT);
});

test("semantic tail rewrite never accepts a new mechanical closing phrase", async () => {
  const compiler = new RewriteCompiler(new Map([[PADDED, 0.78]]));
  const workspace = await createWorkspace(compiler);

  const result = await processSemanticTailRewriteBatch(workspace, [{
    bulletId: "a",
    candidates: [{ strategy: "expand", revisedText: PADDED }],
  }], compiler);

  assert.deepEqual(result.updates, []);
  assert.equal(result.diagnostics.repetitionRejectedCandidateCount, 1);
  assert.match(result.feedback[0]?.reason ?? "", /机械重复结尾/u);
});

test("a unique closing fact remains valid when its exact wording is in the source", () => {
  const fact = "模型输出附带假设来源、公式检查和情景切换说明，便于项目组复用与复核";
  assert.equal(findMechanicalTailEnding({
    text: `执行敏感性分析，${fact}`,
    currentText: "执行敏感性分析",
    otherTexts: [],
    sourceQuotes: [fact],
  }), undefined);
});

test("tail rewrites can bind newly added evidence to the changed bullet", async () => {
  const expanded = `${NATURAL}，输出周度跟踪表`;
  const compiler = new RewriteCompiler(new Map([[expanded, 0.74]]));
  const workspace = await createWorkspace(compiler);
  workspace.supplementalEvidence!.push({
    evidenceId: "e-new",
    experienceId: "exp-1",
    text: "输出周度跟踪表",
    sourceMessageTimestamp: 3,
    createdAt: "2026-08-26T00:00:00.000Z",
  });

  const result = await processSemanticTailRewriteBatch(workspace, [{
    bulletId: "a",
    candidates: [{
      strategy: "expand",
      revisedText: expanded,
      additionalEvidenceIds: ["e-new"],
    }],
  }], compiler);
  assert.deepEqual(result.updates[0]?.evidenceIds, ["e-a", "e-new"]);
  const items = resolveResumeContentChanges(workspace, {
    bulletUpdates: result.updates,
  });
  assert.deepEqual(items[0]?.bullets[0]?.evidenceIds, ["e-a", "e-new"]);
});

test("a sourced rewrite may add one line when the whole page stays safe", async () => {
  const compiler = new RewriteCompiler(new Map([[LONGER, 0.74]]));
  const workspace = await createWorkspace(compiler);
  workspace.supplementalEvidence!.push({
    evidenceId: "e-longer",
    experienceId: "exp-1",
    text: "补充周度跟踪结果与市场范围",
    sourceMessageTimestamp: 4,
    createdAt: "2026-08-26T00:00:00.000Z",
  });

  const result = await processSemanticTailRewriteBatch(workspace, [{
    bulletId: "a",
    candidates: [{
      strategy: "expand",
      revisedText: LONGER,
      additionalEvidenceIds: ["e-longer"],
    }],
  }], compiler);
  assert.equal(result.updates[0]?.text, LONGER);
  assert.equal(result.feedback.find((entry) => entry.status === "applied")?.lineCount, 3);
});

class RewriteCompiler implements ResumeCompiler {
  public compileCount = 0;

  constructor(private readonly ratios: ReadonlyMap<string, number>) {}

  async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    this.compileCount += 1;
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets)
    ).map((bullet) => {
      const ratio = this.ratios.get(bullet.text) ??
        (bullet.id === "b" ? 0.76 : 0.3);
      return {
        bulletId: bullet.id,
        lineCount: bullet.text === LONGER ? 3 : 2,
        lastLineWidthPx: ratio * 600,
        availableLineWidthPx: 600,
        lastLineRatio: ratio,
        fontSizePx: 13,
        ceuPx: 10,
        noWrapTextWidthPx: [...bullet.text].length * 10,
        noWrapTextCjk: [...bullet.text].length,
        tailPolicyVersion: "resume-tail-v2" as const,
        passed: ratio >= 2 / 3,
      };
    });
    return {
      templateId: "resume-standard",
      profileVersion: "test",
      profileHash: "test",
      qualified: bullets.every((bullet) => bullet.passed),
      fontsReady: true,
      loadedFontFamilies: ["SimSun"],
      observedAt: "2026-08-26T00:00:00.000Z",
      viewport: { widthPx: 900, heightPx: 800, devicePixelRatio: 1 },
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 940,
      availableHeightPx: 1000,
      bodyLineHeightPx: 20,
      bodyFontSizePx: 13,
      usageRatio: 0.94,
      effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 1 },
      bullets,
      violations: bullets.filter((bullet) => !bullet.passed).map((bullet) => ({
        code: "bullet_tail_too_short" as const,
        message: "short tail",
        bulletId: bullet.bulletId,
      })),
    };
  }
}

async function createWorkspace(
  compiler: RewriteCompiler,
): Promise<ResumeWorkspace> {
  const structure = {
    language: "zh-CN",
    tail_policy_version: "resume-tail-v2",
    sections: [{
      id: "work",
      type: "work",
      title: "工作经历",
      items: [{
        id: "item-1",
        source_experience_id: "exp-1",
        title: "研究实习生",
        organization: "Example",
        role: "Intern",
        bullets: [{
          id: "a",
          text: CURRENT,
          matched_jd_requirement_ids: ["req-1"],
          source_fact_ids: ["e-a"],
        }, {
          id: "b",
          text: OTHER,
          matched_jd_requirement_ids: ["req-1"],
          source_fact_ids: ["e-b"],
        }],
      }],
    }],
  } as unknown as ResumeStructure;
  const compileResult = await compiler.compile(structure);
  return {
    candidateId: "workspace",
    revision: 1,
    patchCount: 1,
    status: "needs_revision",
    sourceSnapshot: {
      jd: { requirements: [{ id: "req-1" }] },
      experiences: [],
    },
    structure,
    bindings: [],
    compileResult,
    compileObservedRevision: 1,
    bestSnapshot: { revision: 1, structure, bindings: [], compileResult },
    qualityReviewStarted: false,
    repairRound: 0,
    repairHistory: [],
    maxBulletLines: 3,
    itemTiers: { "item-1": "main" },
    bulletLinePlans: {
      a: { plannedLines: 2, lockedLines: 2 },
      b: { plannedLines: 2, lockedLines: 2 },
    },
    bulletProvenance: ["a", "b"].map((bulletId) => ({
      bulletId,
      itemId: "item-1",
      origin: "grounded" as const,
      evidenceIds: [`e-${bulletId}`],
      requirementIds: ["req-1"],
      confirmation: "not_required" as const,
    })),
    supplementalEvidence: [{
      evidenceId: "e-a",
      experienceId: "exp-1",
      text: "分析数字资产平台运营流程，梳理客户转化关键节点并提出流程优化清单",
      sourceMessageTimestamp: 1,
      createdAt: "2026-08-26T00:00:00.000Z",
    }, {
      evidenceId: "e-b",
      experienceId: "exp-1",
      text: "比较同业平台产品范围并形成竞品矩阵",
      sourceMessageTimestamp: 2,
      createdAt: "2026-08-26T00:00:00.000Z",
    }],
  } as unknown as ResumeWorkspace;
}
