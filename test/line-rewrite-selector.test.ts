import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import type { ResumeStructure } from "../src/resume/types.js";
import type { ResumeCompiler } from "../src/resume/workspace/compiler-port.js";
import { selectLineRewrites } from "../src/resume/workspace/line-rewrite-selector.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";

test("underfill applies safe line growth and same-line progress together", async () => {
  const compiler = new UnderfillCompiler();
  const structure = createStructure();
  const compileResult = await compiler.compile(structure);
  const workspace = createWorkspace(structure, compileResult);

  const selected = await selectLineRewrites(workspace, [
    { bulletId: "a", revisedText: "ONE_LINE_PASS" },
    { bulletId: "b", revisedText: "SAME_LINE_PROGRESS" },
  ], compiler);

  assert.deepEqual(selected.updates, [
    { bulletId: "a", text: "ONE_LINE_PASS" },
    { bulletId: "b", text: "SAME_LINE_PROGRESS" },
  ]);
  assert.equal(selected.diagnostics.heightGrowthCount, 1);
  assert.equal(selected.diagnostics.stackedProgressCount, 1);
});

test("same-line progress becomes the next formal baseline", async () => {
  const compiler = new UnderfillCompiler();
  const structure = createStructure();
  const initial = await compiler.compile(structure);
  const workspace = createWorkspace(structure, initial);
  const first = await selectLineRewrites(workspace, [
    { bulletId: "a", revisedText: "SAME_LINE_PROGRESS" },
  ], compiler);

  assert.deepEqual(first.updates, [
    { bulletId: "a", text: "SAME_LINE_PROGRESS" },
  ]);
  structure.sections[0]!.items[0]!.bullets[0]!.text = first.updates[0]!.text;
  workspace.compileResult = await compiler.compile(structure);
  const second = await selectLineRewrites(workspace, [
    { bulletId: "a", revisedText: "ONE_LINE_PASS_AFTER_PROGRESS" },
  ], compiler);

  assert.deepEqual(second.updates, [
    { bulletId: "a", text: "ONE_LINE_PASS_AFTER_PROGRESS" },
  ]);
  assert.equal(second.diagnostics.measuredRewriteCount, 1);
});

test("bullet-depth mode applies every crossing rewrite in one batch", async () => {
  const compiler = new UnderfillCompiler();
  const structure = createStructure();
  const compileResult = await compiler.compile(structure);
  const workspace = createWorkspace(structure, {
    ...compileResult,
    usedHeightPx: 900,
    usageRatio: 0.9,
  });

  const selected = await selectLineRewrites(workspace, [
    { bulletId: "a", revisedText: "ONE_LINE_PASS_A" },
    { bulletId: "b", revisedText: "ONE_LINE_PASS_B" },
  ], compiler, { goal: "bullet_depth", minimumLines: 2 });

  assert.deepEqual(selected.updates, [
    { bulletId: "a", text: "ONE_LINE_PASS_A" },
    { bulletId: "b", text: "ONE_LINE_PASS_B" },
  ]);
  assert.equal(selected.diagnostics.heightGrowthCount, 2);
});

function createWorkspace(
  structure: ResumeStructure,
  compileResult: ResumeCompileResult,
): ResumeWorkspace {
  return {
    candidateId: "candidate",
    revision: 1,
    patchCount: 1,
    status: "needs_revision",
    sourceSnapshot: { jd: { requirements: [] } },
    structure,
    bindings: [],
    compileResult,
    compileObservedRevision: 1,
    bestSnapshot: { revision: 1, structure, bindings: [], compileResult },
    qualityReviewStarted: false,
    repairRound: 0,
    repairHistory: [],
    maxBulletLines: 3,
  } as unknown as ResumeWorkspace;
}

class UnderfillCompiler implements ResumeCompiler {
  async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets)
    ).map((bullet) => {
      const lineCount = bullet.text.startsWith("ONE_LINE_PASS") ? 2 : 1;
      return {
        bulletId: bullet.id,
        lineCount,
        lastLineWidthPx: lineCount === 2 ? 480 : 300,
        availableLineWidthPx: 600,
        lastLineRatio: lineCount === 2 ? 0.8 : 0.5,
        passed: lineCount === 2,
      };
    });
    return {
      templateId: "resume-standard",
      profileVersion: "test",
      profileHash: "test",
      qualified: false,
      fontsReady: true,
      loadedFontFamilies: ["SimSun"],
      observedAt: "2026-08-18T00:00:00.000Z",
      viewport: { widthPx: 900, heightPx: 800, devicePixelRatio: 1 },
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 850,
      availableHeightPx: 1000,
      bodyLineHeightPx: 20,
      bodyFontSizePx: 13,
      usageRatio: 0.85,
      effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 1 },
      bullets,
      violations: [{ code: "page_underfilled", message: "underfilled" }],
    };
  }
}

function createStructure(): ResumeStructure {
  return {
    sections: [{
      id: "work",
      type: "work",
      title: "工作经历",
      items: [{
        id: "item-1",
        title: "研究实习生",
        bullets: [
          { id: "a", text: "BASE_A" },
          { id: "b", text: "BASE_B" },
        ],
      }],
    }],
  } as unknown as ResumeStructure;
}
