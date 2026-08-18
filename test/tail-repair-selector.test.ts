import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import type { ResumeStructure } from "../src/resume/types.js";
import type { ResumeCompiler } from "../src/resume/workspace/compiler-port.js";
import { selectTailRepairPlan } from "../src/resume/workspace/tail-repair-selector.js";
import { buildTailRepairRetryState } from "../src/resume/workspace/tail-repair-state.js";
import { tailRepairBatch } from "../src/resume/workspace/tail-repair-targets.js";
import { tailRepairRetryForWorkspace } from "../src/resume/workspace/tail-repair-ledger.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";

test("tail packing balances one compact revision with one expanded revision", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_LONG_A", "BASE_B"]);

  const selected = await selectTailRepairPlan(workspace, [
    { bulletId: "a", revisedText: "COMPACT_A" },
    {
      bulletId: "b",
      revisedText: "BASE_B_GROUND",
    },
  ], compiler);

  assert.deepEqual(selected.updates, [
    { bulletId: "a", text: "COMPACT_A" },
    { bulletId: "b", text: "BASE_B_GROUND" },
  ]);
  assert.deepEqual(selected.augmentations, []);
});

test("tail packing requires exactly one edit mode per target", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const selected = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_PASS",
    augmentedModifier: { text: "_AUG", requirementIds: ["req-1"] },
  }], compiler);

  assert.deepEqual(selected.updates, []);
  assert.deepEqual(selected.augmentations, []);
  assert.match(selected.writeRejectedReason ?? "", /必须且只能提供/u);
});

test("tail packing returns fragment-level confirmation metadata when needed", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const selected = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    augmentedModifier: {
      text: "_AUG",
      requirementIds: ["req-1"],
    },
  }], compiler);

  assert.deepEqual(selected.updates, [{ bulletId: "a", text: "BASE_A_AUG" }]);
  assert.deepEqual(selected.augmentations, [{
    bulletId: "a",
    baseText: "BASE_A",
    fragmentText: "_AUG",
    appliedText: "BASE_A_AUG",
    requirementIds: ["req-1"],
  }]);
});

test("tail packing rejects a compact plan that would fall below 92 percent", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_LONG_A"]);
  workspace.compileResult = {
    ...workspace.compileResult,
    usedHeightPx: 925,
    usageRatio: 0.925,
  };

  const selected = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "COMPACT_A",
  }], compiler);

  assert.deepEqual(selected.updates, []);
  assert.match(selected.writeRejectedReason ?? "", /92%/u);
});

test("tail repair never compacts a tiered bullet back to one line", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const selected = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_ONE_LINE_PASS",
  }], compiler);

  assert.deepEqual(selected.updates, []);
  assert.equal(selected.feedback[0]?.attempts[0]?.lineCount, 1);
  assert.equal(selected.feedback[0]?.attempts[0]?.withinLineLimit, false);
  assert.equal(selected.feedback[0]?.attempts[0]?.eligible, false);
});

test("tail packing lands the maximum feasible subset instead of rejecting the batch", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A", "BASE_B"]);

  const selected = await selectTailRepairPlan(workspace, [
    {
      bulletId: "a",
      revisedText: "BASE_A_PASS",
    },
    {
      bulletId: "b",
      revisedText: "BASE_B_MISS",
    },
  ], compiler);

  assert.deepEqual(selected.updates, [{ bulletId: "a", text: "BASE_A_PASS" }]);
  assert.match(selected.writeRejectedReason ?? "", /b/u);
});

test("tail packing returns a real measurement for the single revision", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const selected = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_GROUND",
  }], compiler);

  assert.deepEqual(selected.feedback, [{
    bulletId: "a",
    role: "repair",
    selectedOptionIndex: 0,
    attempts: [
      {
        optionIndex: 0,
        kind: "grounded_rewrite",
        characterCount: 13,
        lineCount: 3,
        lineDelta: 1,
        lastLineWidthPx: 480,
        availableLineWidthPx: 600,
        lastLineRatio: 0.8,
        tailWidthDeficitPx: 0,
        tailPassed: true,
        withinLineLimit: true,
        eligible: true,
      },
    ],
  }]);
});

test("tail packing measures full grounded rewrites authored from current evidence", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const selected = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_PASS",
  }], compiler);

  assert.deepEqual(selected.updates, [{ bulletId: "a", text: "BASE_A_PASS" }]);
  assert.deepEqual(selected.feedback[0]?.attempts.map((attempt) => attempt.kind), [
    "grounded_rewrite",
  ]);
});

test("an improving same-line revision is applied and becomes the next baseline", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const first = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_NEAR",
  }], compiler);
  assert.deepEqual(first.updates, [{ bulletId: "a", text: "BASE_A_NEAR" }]);
  assert.equal(first.diagnostics.repairedTailCount, 0);
  assert.equal(first.diagnostics.advancedCandidateCount, 1);
  setBulletText(workspace, "a", "BASE_A_NEAR");
  workspace.compileResult = await compiler.compile(workspace.structure);

  const next = tailRepairBatch(workspace).targets[0]!;
  assert.equal(next.currentText, "BASE_A_NEAR");
  assert.equal(next.editInstruction.direction, "expand");
  assert.ok(next.editInstruction.maximumCharacters >=
    next.editInstruction.minimumCharacters);

  const second = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_NEAR_PASS",
  }], compiler);
  assert.deepEqual(second.updates, [{
    bulletId: "a",
    text: "BASE_A_NEAR_PASS",
  }]);
});

test("a tiny improvement stays in the retry baseline instead of consuming a revision", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const selected = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_TINY",
  }], compiler);

  assert.deepEqual(selected.updates, []);
  workspace.tailRepairRetry = buildTailRepairRetryState(
    undefined,
    selected.attemptRecords,
    selected.allowedNetLineDelta,
  );
  assert.equal(tailRepairBatch(workspace).targets[0]?.currentText, "BASE_A_TINY");
});

test("a worse failed revision does not replace the closest working baseline", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);
  const first = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_NEAR",
  }], compiler);
  const firstRetry = tailRepairRetryForWorkspace(
    workspace,
    first.attemptRecords,
  );
  assert.ok(firstRetry);
  workspace.tailRepairRetry = firstRetry;

  const second = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_WORSE",
  }], compiler);
  const secondRetry = tailRepairRetryForWorkspace(
    workspace,
    second.attemptRecords,
  );
  assert.ok(secondRetry);
  workspace.tailRepairRetry = secondRetry;

  assert.equal(
    tailRepairBatch(workspace).targets[0]?.currentText,
    "BASE_A_NEAR",
  );
});

test("one repeated tail candidate does not reject the rest of a large batch", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A", "BASE_B"]);
  const first = await selectTailRepairPlan(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A_MISS",
  }], compiler);
  const retry = tailRepairRetryForWorkspace(workspace, first.attemptRecords);
  assert.ok(retry);
  workspace.tailRepairRetry = retry;

  const second = await selectTailRepairPlan(workspace, [
    { bulletId: "a", revisedText: "BASE_A_MISS" },
    { bulletId: "b", revisedText: "BASE_B_PASS" },
  ], compiler);

  assert.deepEqual(second.updates, [{ bulletId: "b", text: "BASE_B_PASS" }]);
  assert.match(second.writeRejectedReason ?? "", /a/u);
});

test("tail packing reuses an unresolved compact candidate after a partial revision", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(
    compiler,
    ["BASE_A", "BASE_LONG_B", "BASE_C_PASS"],
  );
  workspace.compileResult = pageResult(workspace.compileResult, 930);

  const first = await selectTailRepairPlan(workspace, [
    { bulletId: "a", revisedText: "BASE_A_PASS" },
    { bulletId: "b", revisedText: "COMPACT_B" },
  ], compiler);

  assert.deepEqual(first.updates, [{ bulletId: "a", text: "BASE_A_PASS" }]);
  const retained = first.attemptRecords.filter((attempt) =>
    !first.updates.some((update) => update.bulletId === attempt.bulletId)
  );
  setBulletText(workspace, "a", "BASE_A_PASS");
  workspace.compileResult = pageResult(await compiler.compile(workspace.structure), 930);
  const retry = tailRepairRetryForWorkspace(workspace, retained);
  assert.ok(retry);
  workspace.tailRepairRetry = retry;
  assert.deepEqual(
    workspace.tailRepairRetry?.attempts.map((attempt) => attempt.bulletId),
    ["b"],
  );
  const changedLayout = {
    ...workspace,
    compileResult: { ...workspace.compileResult, profileHash: "changed" },
  };
  assert.equal(
    tailRepairRetryForWorkspace(changedLayout, retained),
    undefined,
    "layout profile changes must invalidate cached measurements",
  );

  const balanced = await selectTailRepairPlan(workspace, [{
    bulletId: "c",
    revisedText: "BASE_C_PASS_GROUND",
  }], compiler);

  assert.deepEqual(balanced.updates, [
    { bulletId: "b", text: "COMPACT_B" },
    { bulletId: "c", text: "BASE_C_PASS_GROUND" },
  ]);
});

test("page-capacity retry asks a different bullet to balance a cached option", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(
    compiler,
    ["BASE_A_PASS", "BASE_LONG_B", "BASE_C_PASS"],
  );
  workspace.compileResult = pageResult(workspace.compileResult, 930);
  const measured = await selectTailRepairPlan(workspace, [{
    bulletId: "b",
    revisedText: "COMPACT_B",
  }], compiler);
  workspace.tailRepairRetry = buildTailRepairRetryState(
    undefined,
    measured.attemptRecords,
    { minimum: 0, maximum: 3 },
    new Set(["b"]),
  );

  const batch = tailRepairBatch(workspace);

  assert.equal(
    workspace.tailRepairRetry.guidanceByBulletId.b?.mode,
    "page_capacity",
  );
  assert.equal(batch.targets.length, 2);
  assert.equal(
    batch.targets.find((target) => target.bulletId === "b")
      ?.retryGuidance?.mode,
    "page_capacity",
  );
  const balance = batch.targets.find((target) => target.bulletId !== "b");
  assert.equal(balance?.balanceForBulletId, "b");
  assert.equal(balance?.requestedLineDelta, 1);
});

test("tail repair exposes all seventeen failures without a truncated batch", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(
    compiler,
    Array.from({ length: 17 }, (_, index) => `BASE_${index + 1}`),
  );

  const batch = tailRepairBatch(workspace);

  assert.equal(batch.remainingTailCount, 17);
  assert.equal(batch.targets.length, 17);
  assert.ok(batch.targets.every((target) => target.role === "repair"));
});

test("partial tail success keeps every unresolved failure in the next batch", async () => {
  const compiler = new TailPackingCompiler();
  const workspace = await createWorkspace(
    compiler,
    Array.from({ length: 14 }, (_, index) => `BASE_${index + 1}`),
  );
  workspace.compileResult = pageResult(workspace.compileResult, 930);
  const ids = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets).map((bullet) => bullet.id);
  const first = await selectTailRepairPlan(
    workspace,
    ids.map((bulletId, index) => ({
      bulletId,
      revisedText: `BASE_${index + 1}${index < 8 ? "_PASS" : "_MISS"}`,
    })),
    compiler,
  );
  assert.equal(first.updates.length, 8);
  const selectedIds = new Set(first.updates.map((update) => update.bulletId));
  for (const update of first.updates) setBulletText(workspace, update.bulletId, update.text);
  workspace.compileResult = pageResult(
    await compiler.compile(workspace.structure),
    930,
  );
  const retained = first.attemptRecords.filter(
    (attempt) => !selectedIds.has(attempt.bulletId),
  );
  const retry = tailRepairRetryForWorkspace(workspace, retained);
  assert.ok(retry);
  workspace.tailRepairRetry = retry;

  const next = tailRepairBatch(workspace);

  assert.equal(next.remainingTailCount, 6);
  assert.deepEqual(
    new Set(next.targets.map((target) => target.bulletId)),
    new Set(ids.filter((id) => !selectedIds.has(id))),
  );
  assert.ok(next.targets.every((target) =>
    target.retryGuidance?.attemptedCount === 1 &&
    target.retryGuidance.round === 1
  ));
});

class TailPackingCompiler implements ResumeCompiler {
  async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets),
    );
    const measurements = bullets.map((bullet) => measurement(bullet.id, bullet.text));
    const usedHeightPx = 890 + measurements.reduce(
      (sum, bullet) => sum + bullet.lineCount * 20,
      0,
    );
    const violations: ResumeCompileResult["violations"] = measurements
      .filter((bullet) => !bullet.passed).map(
      (bullet) => ({
        code: "bullet_tail_too_short" as const,
        message: "short tail",
        bulletId: bullet.bulletId,
      }),
    );
    if (usedHeightPx < 920) {
      violations.push({ code: "page_underfilled", message: "underfilled" });
    }
    if (usedHeightPx > 1000) {
      violations.push({ code: "page_overflow", message: "overflow" });
    }
    return {
      templateId: "resume-standard",
      profileVersion: "test",
      profileHash: "test",
      qualified: violations.length === 0,
      fontsReady: true,
      loadedFontFamilies: ["SimSun"],
      observedAt: "2026-08-18T00:00:00.000Z",
      viewport: { widthPx: 900, heightPx: 800, devicePixelRatio: 1 },
      pageCount: usedHeightPx > 1000 ? 2 : 1,
      overflowPx: Math.max(0, usedHeightPx - 1000),
      usedHeightPx,
      availableHeightPx: 1000,
      bodyLineHeightPx: 20,
      bodyFontSizePx: 13,
      usageRatio: usedHeightPx / 1000,
      effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 1 },
      bullets: measurements,
      violations,
    };
  }
}

function measurement(bulletId: string, text: string) {
  const compact = text.includes("COMPACT");
  const expanded = text.includes("GROUND");
  const oneLine = text.includes("ONE_LINE");
  const long = text.includes("LONG");
  const passed = compact || expanded || text.includes("PASS") || text.includes("AUG");
  const lineCount = oneLine ? 1 : compact ? 2 : expanded || long ? 3 : 2;
  const near = text.includes("NEAR");
  const tiny = text.includes("TINY");
  const worse = text.includes("WORSE");
  const lastLineWidthPx = passed ? 480 : near ? 360 : tiny ? 90 : worse ? 30 : 60;
  return {
    bulletId,
    lineCount,
    lastLineWidthPx,
    availableLineWidthPx: 600,
    lastLineRatio: lastLineWidthPx / 600,
    passed,
  };
}

function pageResult(result: ResumeCompileResult, usedHeightPx: number) {
  return {
    ...result,
    pageCount: 1,
    overflowPx: 0,
    usedHeightPx,
    availableHeightPx: 1000,
    usageRatio: usedHeightPx / 1000,
  };
}

function setBulletText(workspace: ResumeWorkspace, bulletId: string, text: string) {
  const bullet = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)
    .find((candidate) => candidate.id === bulletId);
  if (!bullet) throw new Error(`missing bullet ${bulletId}`);
  bullet.text = text;
}

async function createWorkspace(
  compiler: TailPackingCompiler,
  texts: string[],
): Promise<ResumeWorkspace> {
  const structure = {
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
        bullets: texts.map((text, index) => ({
          id: bulletId(index),
          text,
          matched_jd_requirement_ids: ["req-1"],
          source_fact_ids: [`e-${bulletId(index)}`],
        })),
      }],
    }],
  } as unknown as ResumeStructure;
  const compileResult = await compiler.compile(structure);
  return {
    candidateId: "candidate",
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
    bulletProvenance: texts.map((_, index) => ({
      bulletId: bulletId(index),
      itemId: "item-1",
      origin: "grounded",
      evidenceIds: [`e-${bulletId(index)}`],
      requirementIds: ["req-1"],
      confirmation: "not_required",
    })),
    supplementalEvidence: texts.map((text, index) => ({
      evidenceId: `e-${bulletId(index)}`,
      experienceId: "exp-1",
      text,
      sourceMessageTimestamp: index,
      createdAt: "2026-08-18T00:00:00.000Z",
    })),
  } as unknown as ResumeWorkspace;
}

function bulletId(index: number): string {
  return ["a", "b", "c"][index] ?? `tail-${index + 1}`;
}
