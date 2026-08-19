import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import type { ResumeStructure } from "../src/resume/types.js";
import { createResumeGenerationFollowUp } from "../src/desktop/main/resume-generation-follow-up.js";
import type { ResumeCompiler } from "../src/resume/workspace/compiler-port.js";
import { resumeContentProgressKey } from "../src/resume/workspace/agent-progress-key.js";
import { processTailRepairBatch } from "../src/resume/workspace/tail-repair-processor.js";
import { tailRepairBatch } from "../src/resume/workspace/tail-repair-targets.js";
import {
  updateTailRepairProgress,
} from "../src/resume/workspace/tail-repair-state.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { resumeWriteResultForModel } from
  "../src/tools/agent-orchestrated/resume-write-result-for-model.js";

test("tail repair measures one complete batch and applies each safe improvement", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A", "BASE_B"]);
  const near = "自然重写并补充具体处理范围NEAR";
  const pass = "自然重写并补充具体执行方法PASS";

  const result = await processTailRepairBatch(workspace, [
    { bulletId: "a", revisedText: near },
    { bulletId: "b", revisedText: pass },
  ], compiler);

  assert.equal(compiler.compileCount, 2, "one baseline and one batch compile");
  assert.deepEqual(result.updates, [
    { bulletId: "a", text: near },
    { bulletId: "b", text: pass },
  ]);
  assert.equal(result.diagnostics.measuredTargetCount, 2);
  assert.equal(result.diagnostics.appliedTargetCount, 2);
  assert.equal(result.feedback.every((entry) => entry.status === "applied"), true);
});

test("a rejected edit never becomes a hidden working text", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: insertBeforeLast("BASE_A", "TINY"),
  }], compiler);

  assert.deepEqual(result.updates, []);
  assert.equal(result.diagnostics.insufficientGainRejectedTargetCount, 1);
  assert.equal(result.diagnostics.lineCountRejectedTargetCount, 0);
  assert.equal(result.diagnostics.validationRejectedTargetCount, 0);
  assert.equal(result.progress.byBulletId.a?.zeroProgressRounds, 1);
  assert.equal(tailRepairBatch({
    ...workspace,
    tailRepairProgress: result.progress,
  }).targets[0]?.currentText, "BASE_A");
});

test("a pre-measurement validation failure keeps the latest formal baseline", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: "BASE_A",
  }], compiler);

  assert.equal(result.diagnostics.validationRejectedTargetCount, 1);
  assert.deepEqual(result.diagnostics.validationReasonCounts, {
    unchangedOrRepeated: 1,
    contentQuality: 0,
    unsupportedEvidence: 0,
    other: 0,
  });
  assert.equal(result.progress.byBulletId.a?.zeroProgressRounds, 1);
});

test("tail repair rejects a shorter rewrite before measurement", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_LONG_TEXT"]);
  const before = compiler.compileCount;

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: "BASE_SHORT",
  }], compiler);

  assert.equal(compiler.compileCount, before);
  assert.equal(result.diagnostics.validationRejectedTargetCount, 1);
  assert.match(result.feedback[0]?.reason ?? "", /不能删减当前内容/u);
});

test("tail repair may use a same-length semantic rewrite when pixels improve", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);
  const rewrite = "合格甲乙丙丁";

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: rewrite,
  }], compiler);

  assert.equal([...rewrite].length, [..."BASE_A"].length);
  assert.deepEqual(result.updates, [{ bulletId: "a", text: rewrite }]);
});

test("tail repair accepts a longer semantic rewrite without exact insertion", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["ABCDE"]);
  const rewrite = "围绕样品修复流程完成自然语义扩写PASS";

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: rewrite,
  }], compiler);

  assert.equal(compiler.compileCount, 2);
  assert.deepEqual(result.updates, [{ bulletId: "a", text: rewrite }]);
  assert.equal(result.diagnostics.validationRejectedTargetCount, 0);
});

test("tail repair does not reject semantic expansion from a character window", async () => {
  const compiler = new TailCompiler();
  const current = Array.from({ length: 90 }, (_, index) =>
    String.fromCodePoint(0x4e00 + index)
  ).join("");
  const workspace = await createWorkspace(compiler, [current]);
  workspace.compileResult.usedHeightPx = workspace.compileResult.availableHeightPx;
  const before = compiler.compileCount;

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: `${current}补充具体方法PASS`,
  }], compiler);

  assert.equal(compiler.compileCount, before + 1);
  assert.equal(result.diagnostics.validationRejectedTargetCount, 0);
  assert.equal(result.diagnostics.appliedTargetCount, 1);
});

test("tail targets describe semantic expansion instead of a character window", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["研".repeat(90)]);

  const target = tailRepairBatch(workspace).targets[0]!;

  assert.equal(target.currentLineCount, 2);
  assert.match(target.expansionGoal, /具体/u);
  assert.equal("targetLineCount" in target, false);
  assert.equal("suggestedAddedCharacters" in target, false);
});

test("model-facing tail receipt keeps only rejected compact feedback", () => {
  const result = resumeWriteResultForModel({
    revision: 8,
    nextAction: { mode: "batch_tail_repair" },
    rewriteWarning: "duplicated long reasons",
    tailRepairFeedback: [
      { bulletId: "a", status: "applied", measurement: { characterCount: 90 } },
      { bulletId: "b", status: "rejected", reason: "must insert" },
    ],
  });

  assert.equal("rewriteWarning" in result, false);
  assert.deepEqual(result.tailRepairFeedback, [{
    bulletId: "b",
    status: "rejected",
    reason: "must insert",
  }]);
  assert.match(String(result.tailRepairReminder), /逐条执行 requiredEdit/u);
  assert.match(String(result.tailRepairReminder), /语义/u);
  assert.match(String(result.tailRepairReminder), /Chromium/u);
  assert.match(String(result.tailRepairReminder), /currentLineCount/u);
  assert.doesNotMatch(String(result.tailRepairReminder), /maximum|minimum|净增加/u);
});

test("model-facing length targets remain guidance while Chromium is authoritative", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["中文基线"]);
  const rewrite =
    "自然语义重写覆盖样品分层处理边界异常识别复核流程协作角色验收标准数据口径影响范围用户反馈问题定位解决步骤交付条件结果解释PASS";

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: rewrite,
  }], compiler);

  assert.deepEqual(result.updates, [{ bulletId: "a", text: rewrite }]);
  assert.equal(result.diagnostics.validationRejectedTargetCount, 0);
});

test("content-quality validation is separated from unchanged text", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: "围绕当前职责形成数据驱动决策闭环",
  }], compiler);

  assert.equal(result.diagnostics.validationReasonCounts.contentQuality, 1);
  assert.equal(result.diagnostics.validationReasonCounts.unchangedOrRepeated, 0);
});

test("semantic expansion preserves every existing numeric fact", async () => {
  const compiler = new TailCompiler();
  const current = "将样品修复成功率提升至 79%";
  const workspace = await createWorkspace(compiler, [current]);
  const acceptedText = "通过可修复样品分层处理，将成功率提升至 79% PASS";
  const accepted = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: acceptedText,
  }], compiler);
  assert.deepEqual(accepted.updates, [{ bulletId: "a", text: acceptedText }]);

  const rejected = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: "通过可修复样品分层处理，将成功率提升至 80% PASS",
  }], compiler);
  assert.equal(rejected.diagnostics.validationReasonCounts.unsupportedEvidence, 1);
  assert.match(rejected.feedback[0]?.reason ?? "", /保留原有数字.*79/u);
});

test("a repeated rejected text is blocked without hiding progress on other bullets", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A", "BASE_B"]);
  const first = await processTailRepairBatch(workspace, [
    { bulletId: "a", revisedText: insertBeforeLast("BASE_A", "TINY") },
    { bulletId: "b", revisedText: insertBeforeLast("BASE_B", "TINY") },
  ], compiler);
  workspace.tailRepairProgress = first.progress;

  const second = await processTailRepairBatch(workspace, [
    { bulletId: "a", revisedText: insertBeforeLast("BASE_A", "TINY") },
    { bulletId: "b", revisedText: insertBeforeLast("BASE_B", "PASS") },
  ], compiler);

  assert.deepEqual(second.updates, [{
    bulletId: "b",
    text: insertBeforeLast("BASE_B", "PASS"),
  }]);
  assert.equal(second.diagnostics.validationRejectedTargetCount, 1);
  assert.match(
    second.feedback.find((entry) => entry.bulletId === "a")?.reason ?? "",
    /已经提交过/u,
  );
});

test("every rejected tail fingerprint remains blocked until the formal text advances", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);
  const firstText = insertBeforeLast("BASE_A", "TINY_ONE");
  const secondText = insertBeforeLast("BASE_A", "TINY_TWO");
  const first = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: firstText,
  }], compiler);
  workspace.tailRepairProgress = first.progress;
  const second = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: secondText,
  }], compiler);
  workspace.tailRepairProgress = second.progress;

  const repeated = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: firstText,
  }], compiler);

  assert.equal(repeated.diagnostics.validationRejectedTargetCount, 1);
  assert.match(repeated.feedback[0]?.reason ?? "", /已经提交过/u);
});

test("tail repair rejects a two-to-three-line rewrite even when its tail passes", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText: insertBeforeLast("BASE_A", "XLPASS"),
  }], compiler);

  assert.deepEqual(result.updates, []);
  assert.equal(result.diagnostics.lineCountRejectedTargetCount, 1);
  assert.equal(result.diagnostics.insufficientGainRejectedTargetCount, 0);
  assert.match(result.feedback[0]?.reason ?? "", /保持当前实测的 2 行/u);
});

test("tail repair rejects a two-to-three-line intermediate rewrite", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);
  const revisedText = insertBeforeLast("BASE_A", "XL语义扩写补充具体方法");

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    revisedText,
  }], compiler);

  assert.deepEqual(result.updates, []);
  assert.equal(result.diagnostics.progressedTargetCount, 0);
  assert.equal(result.diagnostics.lineCountRejectedTargetCount, 1);
  assert.equal(result.diagnostics.insufficientGainRejectedTargetCount, 0);
});

test("three whole-batch zero-progress rounds pause", () => {
  const first = updateTailRepairProgress(undefined, [
    { bulletId: "a", applied: false, textFingerprint: "one" },
  ], new Set(["a"]));
  const second = updateTailRepairProgress(first, [
    { bulletId: "a", applied: false, textFingerprint: "two" },
  ], new Set(["a"]));
  const third = updateTailRepairProgress(second, [
    { bulletId: "a", applied: false, textFingerprint: "three" },
  ], new Set(["a"]));

  assert.equal(second.byBulletId.a?.zeroProgressRounds, 2);
  assert.equal(second.zeroProgressRounds, 2);
  assert.equal(third.byBulletId.a?.zeroProgressRounds, 3);
  assert.equal(third.byBulletId.a?.attemptedRounds, 3);
  assert.equal(third.zeroProgressRounds, 3);
  assert.equal(third.stalled, true);
});

test("one formally applied edit keeps the remaining batch stacking", () => {
  const first = updateTailRepairProgress(undefined, [
    { bulletId: "a", applied: false, textFingerprint: "a-one" },
    { bulletId: "b", applied: false, textFingerprint: "b-one" },
  ], new Set(["a", "b"]));
  const second = updateTailRepairProgress(first, [
    { bulletId: "a", applied: false, textFingerprint: "a-two" },
    { bulletId: "b", applied: false, textFingerprint: "b-two" },
  ], new Set(["a", "b"]));
  const partial = updateTailRepairProgress(second, [
    { bulletId: "a", applied: false, textFingerprint: "a-three" },
    { bulletId: "b", applied: true, textFingerprint: "b-three" },
  ], new Set(["a", "b"]));

  assert.equal(partial.byBulletId.a?.zeroProgressRounds, 3);
  assert.equal(partial.zeroProgressRounds, 0);
  assert.equal(partial.stalled, false);
});

test("a stall round requires trying every unresolved bullet without progress", () => {
  const failed = new Set(["a", "b", "c"]);
  const firstBatch = updateTailRepairProgress(undefined, [
    { bulletId: "a", applied: false, textFingerprint: "a-one" },
    { bulletId: "b", applied: false, textFingerprint: "b-one" },
  ], failed);
  assert.equal(firstBatch.zeroProgressRounds, 0);
  assert.deepEqual(firstBatch.attemptedBulletIdsSinceProgress, ["a", "b"]);

  const completedSweep = updateTailRepairProgress(firstBatch, [
    { bulletId: "c", applied: false, textFingerprint: "c-one" },
  ], failed);
  assert.equal(completedSweep.zeroProgressRounds, 1);
  assert.deepEqual(completedSweep.attemptedBulletIdsSinceProgress, []);
  assert.equal(completedSweep.stalled, false);
});

test("formal tail progress resets the per-bullet zero-progress counter", () => {
  const first = updateTailRepairProgress(undefined, [
    { bulletId: "a", applied: true, textFingerprint: "one" },
  ], new Set(["a"]));
  const second = updateTailRepairProgress(first, [
    { bulletId: "a", applied: true, textFingerprint: "two" },
  ], new Set(["a"]));
  const third = updateTailRepairProgress(second, [
    { bulletId: "a", applied: true, textFingerprint: "three" },
  ], new Set(["a"]));

  assert.equal(first.byBulletId.a?.zeroProgressRounds, 0);
  assert.equal(second.byBulletId.a?.zeroProgressRounds, 0);
  assert.equal(third.byBulletId.a?.zeroProgressRounds, 0);
  assert.equal(first.byBulletId.a?.appliedRounds, 1);
  assert.equal(second.byBulletId.a?.appliedRounds, 2);
  assert.equal(third.byBulletId.a?.appliedRounds, 3);
  assert.equal(third.byBulletId.a?.attemptedRounds, 3);
});

test("a successful extension clears earlier rejected-text state", () => {
  const rejected = updateTailRepairProgress(undefined, [
    { bulletId: "a", applied: false, textFingerprint: "one" },
  ], new Set(["a"]));
  const applied = updateTailRepairProgress(rejected, [
    { bulletId: "a", applied: true, textFingerprint: "two" },
  ], new Set(["a"]));

  assert.deepEqual(rejected.byBulletId.a?.rejectedTextFingerprints, ["one"]);
  assert.equal(applied.byBulletId.a?.zeroProgressRounds, 0);
  assert.equal(applied.byBulletId.a?.rejectedTextFingerprints, undefined);
});

test("no-progress counters do not masquerade as resume content progress", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);
  const before = resumeContentProgressKey(workspace);
  workspace.tailRepairProgress = updateTailRepairProgress(undefined, [
    { bulletId: "a", applied: false, textFingerprint: "one" },
  ], new Set(["a"]));

  assert.equal(resumeContentProgressKey(workspace), before);
});

test("automatic follow-up is not re-queued for counter-only churn", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["BASE_A"]);
  const store = new ResumeWorkspaceStore();
  store.create(workspace);
  const followUp = createResumeGenerationFollowUp(store);
  assert.ok(followUp(1));

  workspace.tailRepairProgress = updateTailRepairProgress(undefined, [
    { bulletId: "a", applied: false, textFingerprint: "one" },
  ], new Set(["a"]));
  store.restore(workspace);

  assert.equal(followUp(1), undefined);
});

test("tail repair exposes every failed bullet without truncation", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(
    compiler,
    Array.from({ length: 17 }, (_, index) => `BASE_${index + 1}`),
  );

  const batch = tailRepairBatch(workspace);

  assert.equal(batch.remainingTailCount, 17);
  assert.equal(batch.targets.length, 17);
  assert.ok(batch.targets.every((target) => target.currentText.length > 0));
});

test("tail repair rotates formally attempted bullets behind untouched targets", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(
    compiler,
    Array.from({ length: 12 }, (_, index) => `BASE_${index + 1}`),
  );
  const initial = tailRepairBatch(workspace).targets.map((target) =>
    target.bulletId
  );
  const attempted = initial.slice(0, 6);
  workspace.tailRepairProgress = updateTailRepairProgress(undefined,
    attempted.map((bulletId) => ({
      bulletId,
      applied: true,
      textFingerprint: bulletId,
    })), new Set(initial));

  const rotated = tailRepairBatch(workspace).targets.map((target) =>
    target.bulletId
  );
  assert.ok(rotated.slice(0, 6).every((bulletId) =>
    !attempted.includes(bulletId)
  ));
});

test("tail repair rotates rejected attempts behind untouched targets", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(
    compiler,
    Array.from({ length: 12 }, (_, index) => `BASE_${index + 1}`),
  );
  const initial = tailRepairBatch(workspace).targets.map((target) =>
    target.bulletId
  );
  const attempted = initial.slice(0, 6);
  workspace.tailRepairProgress = updateTailRepairProgress(undefined,
    attempted.map((bulletId) => ({
      bulletId,
      applied: false,
      textFingerprint: bulletId,
    })), new Set(initial));

  const rotated = tailRepairBatch(workspace).targets.map((target) =>
    target.bulletId
  );
  assert.ok(rotated.slice(0, 6).every((bulletId) =>
    !attempted.includes(bulletId)
  ));
});

class TailCompiler implements ResumeCompiler {
  public compileCount = 0;

  async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    this.compileCount += 1;
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets),
    ).map((bullet) => measurement(bullet.id, bullet.text));
    return {
      templateId: "resume-standard",
      profileVersion: "test",
      profileHash: "test",
      qualified: bullets.every((bullet) => bullet.passed),
      fontsReady: true,
      loadedFontFamilies: ["SimSun"],
      observedAt: "2026-08-19T00:00:00.000Z",
      viewport: { widthPx: 900, heightPx: 800, devicePixelRatio: 1 },
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 950,
      availableHeightPx: 1000,
      bodyLineHeightPx: 20,
      bodyFontSizePx: 13,
      usageRatio: 0.95,
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

function measurement(bulletId: string, text: string) {
  const passed = text.includes("PASS") || text.includes("合格");
  const near = text.includes("NEAR");
  const tiny = text.includes("TINY");
  const lineCount = text.includes("XXL") ? 4 : text.includes("XL") ? 3 : 2;
  const lastLineWidthPx = passed ? 480 : near ? 180 : tiny ? 65 : 60;
  return {
    bulletId,
    lineCount,
    lastLineWidthPx,
    availableLineWidthPx: 600,
    lastLineRatio: lastLineWidthPx / 600,
    passed,
  };
}

function insertBeforeLast(currentText: string, addition: string): string {
  const characters = [...currentText];
  return [
    ...characters.slice(0, -1),
    ...addition,
    ...characters.slice(-1),
  ].join("");
}

async function createWorkspace(
  compiler: TailCompiler,
  texts: readonly string[],
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
      createdAt: "2026-08-19T00:00:00.000Z",
    })),
  } as unknown as ResumeWorkspace;
}

function bulletId(index: number): string {
  return ["a", "b", "c"][index] ?? `tail-${index + 1}`;
}
