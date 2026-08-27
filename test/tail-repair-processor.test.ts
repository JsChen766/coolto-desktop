import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import type { ResumeStructure } from "../src/resume/types.js";
import { resumeAgentNextAction } from
  "../src/resume/workspace/agent-next-action.js";
import type { ResumeCompiler } from
  "../src/resume/workspace/compiler-port.js";
import { resumeTailRepairLoopGuardKey } from
  "../src/resume/workspace/resume-write-loop-key.js";
import { composeTailExpansion, composeTailGrowth } from
  "../src/resume/workspace/tail-repair-input.js";
import { tailGrowthInstruction } from
  "../src/resume/workspace/tail-repair-instruction.js";
import { processTailRepairBatch } from
  "../src/resume/workspace/tail-repair-processor.js";
import {
  MAX_TAIL_GROWTH_REJECTIONS,
  MAX_TAIL_REFLOW_ATTEMPTS,
  tailGrowthFingerprint,
  updateTailRepairProgress,
} from "../src/resume/workspace/tail-repair-state.js";
import { updateTailReflowProgress } from
  "../src/resume/workspace/tail-reflow-progress.js";
import type { TailRepairProgressState } from
  "../src/resume/workspace/tail-repair-state.js";
import { tailRepairBatch } from
  "../src/resume/workspace/tail-repair-targets.js";
import { workspaceWithTailRepairProgress } from
  "../src/resume/workspace/tail-repair-workspace.js";
import type { ResumeWorkspace } from
  "../src/resume/workspace/types.js";
import { resumeWriteResultForModel } from
  "../src/tools/agent-orchestrated/resume-write-result-for-model.js";

test("host composes one growth fragment without rewriting the baseline", () => {
  assert.equal(
    composeTailGrowth("完成重点公司分析", "覆盖市场份额与盈利指标", "zh-CN"),
    "完成重点公司分析，覆盖市场份额与盈利指标",
  );
  assert.equal(
    composeTailGrowth("Built a valuation model", "covered three scenarios", "en-US"),
    "Built a valuation model; covered three scenarios",
  );
  assert.equal(
    composeTailGrowth("完成重点公司分析，", "覆盖核心指标。", "zh-CN"),
    "完成重点公司分析，覆盖核心指标",
  );
});

test("host inserts one component after a unique anchor", () => {
  assert.equal(
    composeTailExpansion("负责行业研究并形成报告", {
      bulletId: "a",
      component: "method",
      placement: "after",
      anchor: "行业研究",
      insertText: "，结合财务指标交叉验证",
    }, "zh-CN"),
    "负责行业研究，结合财务指标交叉验证并形成报告",
  );
});

test("tail growth measures one batch and applies every safe fragment", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["基底甲", "基底乙"]);

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    growthText: "补充具体分析方法NEAR",
  }, {
    bulletId: "b",
    growthText: "覆盖明确执行范围PASS",
  }], compiler);

  assert.equal(compiler.compileCount, 2, "baseline plus one batch compile");
  assert.deepEqual(result.updates, [{
    bulletId: "a",
    text: "基底甲，补充具体分析方法NEAR",
  }, {
    bulletId: "b",
    text: "基底乙，覆盖明确执行范围PASS",
  }]);
  assert.equal(result.diagnostics.appliedTargetCount, 2);
  assert.equal(result.diagnostics.passedTargetCount, 1);
  assert.equal(result.diagnostics.progressedTargetCount, 1);
});

test("a model cannot submit the full bullet as growth text", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["锁定基底"]);
  const before = compiler.compileCount;

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    growthText: "锁定基底并补充完整事实",
  }], compiler);

  assert.equal(compiler.compileCount, before);
  assert.deepEqual(result.updates, []);
  assert.equal(result.progress.byBulletId.a?.consecutiveRejects, 1);
  assert.equal(result.progress.byBulletId.a?.lastFailureType, "duplicate");
  assert.match(result.feedback[0]?.reason ?? "", /只能提交新增片段/u);
});

test("a too-long growth is rejected and never becomes a hidden baseline", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["正式基底"]);

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    growthText: "补充过长执行细节XXL",
  }], compiler);

  assert.deepEqual(result.updates, []);
  assert.equal(result.progress.byBulletId.a?.lastFailureType, "too_long");
  const retry = tailRepairBatch({
    ...workspace,
    tailRepairProgress: result.progress,
  }).targets[0]!;
  assert.equal(retry.currentText, "正式基底");
  assert.deepEqual(retry.rejectedGrowths, ["补充过长执行细节XXL"]);
});

test("an insufficient fragment is rejected with one simple reason", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["正式基底"]);

  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    growthText: "补充TINY",
  }], compiler);

  assert.deepEqual(result.updates, []);
  assert.equal(
    result.progress.byBulletId.a?.lastFailureType,
    "insufficient_growth",
  );
  assert.equal(result.diagnostics.insufficientGainRejectedTargetCount, 1);
});

test("a rejected growth cannot be replayed", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["正式基底"]);
  const first = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    growthText: "补充TINY",
  }], compiler);
  workspace.tailRepairProgress = first.progress;
  const initialReason = first.progress.byBulletId.a?.lastFailureReason;
  const before = compiler.compileCount;

  const second = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    growthText: "补充TINY",
  }], compiler);

  assert.equal(compiler.compileCount, before);
  assert.equal(second.progress.byBulletId.a?.consecutiveRejects, 2);
  assert.equal(second.progress.byBulletId.a?.lastFailureType, "duplicate");
  assert.ok(initialReason);
  assert.equal(second.progress.byBulletId.a?.lastFailureReason, initialReason);
  assert.match(second.feedback[0]?.reason ?? "", /已经被拒绝/u);
});

test("the second growth outcome advances only that bullet to reflow", () => {
  const failed = new Set(["a", "b"]);
  let progress = updateTailRepairProgress(undefined, [{
    bulletId: "a",
    applied: false,
    growthFingerprint: "a-1",
    rejectedGrowth: "片段甲",
    failureType: "invalid_content",
  }, {
    bulletId: "b",
    applied: false,
    growthFingerprint: "b-1",
    rejectedGrowth: "片段乙",
    failureType: "too_long",
  }], failed);
  progress = updateTailRepairProgress(progress, [{
    bulletId: "a",
    applied: true,
    growthFingerprint: "a-2",
  }], failed);

  assert.equal(progress.byBulletId.a?.consecutiveRejects, 0);
  assert.equal(progress.byBulletId.a?.mode, "reflow");
  assert.equal(progress.byBulletId.b?.consecutiveRejects, 1);
  assert.equal(progress.byBulletId.b?.mode, "growth");
  assert.equal(progress.stalled, false);
});

test("a second measured growth attempt routes the remaining bullet to reflow", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, [
    "完成行业研究并形成报告",
    "已通过尾行一PASS",
    "已通过尾行二PASS",
  ]);
  const result = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    growthText: "采用结构化分析NEAR",
  }], compiler);
  workspace.tailRepairProgress = result.progress;
  const second = await processTailRepairBatch(workspace, [{
    bulletId: "a",
    growthText: "补充投资框架NEAR",
  }], compiler);
  assert.equal(second.progress.byBulletId.a?.mode, "reflow");
  assert.equal(result.diagnostics.appliedTargetCount, 1);
});

test("legacy reflow rejection history remains bounded", () => {
  let progress: TailRepairProgressState = {
    byBulletId: { a: { mode: "reflow" as const, consecutiveRejects: 0 } },
    stalled: false,
  };
  for (let index = 0; index < MAX_TAIL_REFLOW_ATTEMPTS; index += 1) {
    progress = updateTailReflowProgress(progress, [{
      bulletId: "a",
      applied: false,
      rewriteFingerprint: `rewrite-${index}`,
      rejectedRewrite: `改写${index}`,
    }], new Set(["a"]));
  }

  assert.equal(progress.byBulletId.a?.reflowAttempts, 2);
  assert.equal(progress.stalled, true);
});

test("next action requests complete semantic rewrites after real progress", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, [
    "完成行业研究并形成报告",
    "已通过尾行一PASS",
    "已通过尾行二PASS",
  ]);
  workspace.tailRepairProgress = updateTailRepairProgress(undefined, [{
    bulletId: "a",
    applied: true,
    growthFingerprint: "accepted-growth",
  }], new Set(["a"]));

  const action = resumeAgentNextAction(workspace);

  assert.equal(action.mode, "batch_tail_rewrite");
  if (action.mode !== "batch_tail_rewrite") return;
  assert.equal(action.requiredInput, "tailRewrites");
  assert.deepEqual(action.bulletIds, ["a"]);
  assert.equal(action.tailRewriteTargets[0]?.lengthBudget?.unit,
    "cjk_visual_unit");
});

test("two growth attempts switch a bullet to ordered reflow", () => {
  let progress = updateTailRepairProgress(undefined, [], new Set(["a"]));
  for (let index = 0; index < MAX_TAIL_GROWTH_REJECTIONS; index += 1) {
    progress = updateTailRepairProgress(progress, [{
      bulletId: "a",
      applied: false,
      growthFingerprint: `growth-${index}`,
      rejectedGrowth: `片段${index}`,
      failureType: "invalid_content",
    }], new Set(["a"]));
  }

  assert.equal(progress.byBulletId.a?.growthAttempts, 2);
  assert.deepEqual(progress.byBulletId.a?.rejectedGrowths, ["片段0", "片段1"]);
  assert.equal(progress.byBulletId.a?.mode, "reflow");
  assert.equal(progress.stalled, false);
});

test("stalled tail growth becomes one neutral material request", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["正式基底"]);
  let progress = updateTailRepairProgress(undefined, [], new Set(["a"]));
  for (let index = 0; index < MAX_TAIL_GROWTH_REJECTIONS; index += 1) {
    progress = updateTailRepairProgress(progress, [{
      bulletId: "a",
      applied: false,
      growthFingerprint: `growth-${index}`,
      rejectedGrowth: `片段${index}`,
      failureType: "invalid_content" as const,
    }], new Set(["a"]));
  }
  for (let index = 0; index < MAX_TAIL_REFLOW_ATTEMPTS; index += 1) {
    progress = updateTailReflowProgress(progress, [{
      bulletId: "a",
      applied: false,
      rewriteFingerprint: `rewrite-${index}`,
      rejectedRewrite: `改写${index}`,
    }], new Set(["a"]));
  }

  const stopped = workspaceWithTailRepairProgress(workspace, progress);

  assert.equal(stopped.status, "needs_user_decision");
  assert.equal(stopped.materialRequest?.kind, "tail_repair_stalled");
  assert.equal(resumeAgentNextAction(stopped).mode, "request_more_material");
});

test("authorized final tail closure cannot return to a material question", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["正式基底"]);
  workspace.factNeutralAuthorization = {
    sourceRequestKind: "tail_repair_stalled",
    confirmedAt: "2026-08-27T00:00:00.000Z",
    confirmedMessageTimestamp: 100,
  };
  workspace.itemTiers = { "item-1": "utility" };
  let progress = updateTailReflowProgress(undefined, [], new Set(["a"]));
  for (let index = 0; index < MAX_TAIL_REFLOW_ATTEMPTS; index += 1) {
    progress = updateTailReflowProgress(progress, [{
      bulletId: "a",
      applied: false,
      rewriteFingerprint: `final-rewrite-${index}`,
      rejectedRewrite: `最终改写${index}`,
    }], new Set(["a"]));
  }

  const reopened = workspaceWithTailRepairProgress(workspace, progress);

  assert.notEqual(reopened.status, "needs_user_decision");
  assert.equal(reopened.materialRequest, undefined);
  assert.equal(reopened.tailRepairProgress?.stalled, false);
  assert.equal(resumeAgentNextAction(reopened).mode, "batch_tail_rewrite");
});

test("next action batches at most four semantic tail rewrite targets", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(
    compiler,
    Array.from({ length: 8 }, (_, index) => `基底${index + 1}`),
  );

  const action = resumeAgentNextAction(workspace);

  assert.equal(action.mode, "batch_tail_rewrite");
  if (action.mode !== "batch_tail_rewrite") return;
  assert.equal(action.requiredInput, "tailRewrites");
  assert.equal(action.tailRewriteTargets.length, 4);
  assert.ok(action.tailRewriteTargets.every((target) =>
    typeof target.requiredEdit === "string" &&
    Array.isArray(target.rejectedCandidates) &&
    target.lengthBudget?.unit === "cjk_visual_unit" &&
    !("protocolRecoveryLevel" in target) &&
    !("expansionGoal" in target)
  ));
});

test("rejected bullets rotate behind untouched bullets", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(
    compiler,
    Array.from({ length: 6 }, (_, index) => `基底${index + 1}`),
  );
  const initial = tailRepairBatch(workspace).targets.map((target) => target.bulletId);
  workspace.tailRepairProgress = updateTailRepairProgress(undefined, [{
    bulletId: initial[0]!,
    applied: false,
    growthFingerprint: "rejected",
    rejectedGrowth: "被拒片段",
    failureType: "invalid_content",
  }], new Set(initial));

  const rotated = tailRepairBatch(workspace).targets.map((target) => target.bulletId);

  assert.notEqual(rotated[0], initial[0]);
  assert.equal(rotated.at(-1), initial[0]);
});

test("model receipt asks for complete fact-equivalent tail rewrites", () => {
  const result = resumeWriteResultForModel({
    revision: 8,
    nextAction: { mode: "batch_tail_repair" },
    tailRepairFeedback: [
      { bulletId: "a", status: "applied" },
      { bulletId: "b", status: "rejected", reason: "too long" },
    ],
  });

  assert.deepEqual(result.tailRepairFeedback, [{
    bulletId: "b",
    status: "rejected",
    reason: "too long",
  }]);
  assert.match(String(result.tailRepairReminder), /tailRewrites/u);
  assert.match(String(result.tailRepairReminder), /完整事实等价改写/u);
  assert.match(String(result.tailRepairReminder), /固定尾缀/u);
});

test("model receipt keeps the semantic rewrite protocol authoritative", () => {
  const result = resumeWriteResultForModel({
    revision: 9,
    nextAction: { mode: "batch_tail_repair" },
    tailRepairFeedback: [
      { bulletId: "a", status: "rejected", reason: "tail short" },
    ],
  });

  assert.match(String(result.tailRepairReminder), /batch_tail_rewrite/u);
  assert.match(String(result.tailRepairReminder), /tailRewrites/u);
});

test("model receipt preserves the exact neutral insertion protocol", () => {
  const result = resumeWriteResultForModel({
    revision: 10,
    nextAction: {
      mode: "batch_tail_rewrite",
      tailRewriteTargets: [{
        bulletId: "a",
        contentMode: "fact_neutral",
      }],
    },
    tailRepairFeedback: [
      { bulletId: "a", status: "rejected", reason: "changed source text" },
    ],
  });

  assert.match(String(result.tailRepairReminder), /逐字保留 currentText/u);
  assert.match(String(result.tailRepairReminder), /contentMode=fact_neutral/u);
  assert.match(String(result.tailRepairReminder), /禁止传 additionalEvidenceIds/u);
  assert.doesNotMatch(String(result.tailRepairReminder), /吸收 availableEvidence/u);
});

test("failure guidance is finite and directly actionable", () => {
  assert.match(
    tailGrowthInstruction("too_long", "补一个具体短语"),
    /更短/u,
  );
  assert.match(
    tailGrowthInstruction("insufficient_growth", "补一个具体短语"),
    /更完整/u,
  );
  assert.match(
    tailGrowthInstruction("duplicate", "补一个具体短语"),
    /更换增长方向/u,
  );
  assert.match(
    tailGrowthInstruction(
      "duplicate",
      "补一个具体短语",
      undefined,
      undefined,
      "空泛效果结尾",
    ),
    /具体对象、范围、方法或数字/u,
  );
});

test("loop key advances with bounded rejection state", async () => {
  const compiler = new TailCompiler();
  const workspace = await createWorkspace(compiler, ["正式基底"]);
  const before = resumeTailRepairLoopGuardKey(workspace);
  workspace.tailRepairProgress = updateTailRepairProgress(undefined, [{
    bulletId: "a",
    applied: false,
    growthFingerprint: tailGrowthFingerprint("被拒片段"),
    rejectedGrowth: "被拒片段",
    failureType: "duplicate",
  }], new Set(["a"]));

  assert.notEqual(resumeTailRepairLoopGuardKey(workspace), before);
});

class TailCompiler implements ResumeCompiler {
  public compileCount = 0;

  async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    this.compileCount += 1;
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets)
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
  const passed = text.includes("PASS");
  const near = text.includes("NEAR");
  const tiny = text.includes("TINY");
  const lineCount = text.includes("XXL") ? 4 : 2;
  const lastLineWidthPx = passed ? 480 : near ? 180 : tiny ? 65 : 60;
  return {
    bulletId,
    lineCount,
    lastLineWidthPx,
    availableLineWidthPx: 600,
    lastLineRatio: lastLineWidthPx / 600,
    fontSizePx: 13,
    ceuPx: 10,
    noWrapTextWidthPx: [...text].length * 10,
    noWrapTextCjk: [...text].length,
    tailPolicyVersion: "resume-tail-v2" as const,
    tailProbe: {
      styleSignature: "test-simsun-13",
      separatorText: "，",
      separatorWidthPx: 10,
      hardCjk: 4,
      minCjk: 5,
      idealCjk: 6,
      maxCjk: 10,
      wrapRisk: "low" as const,
    },
    passed,
  };
}

async function createWorkspace(
  compiler: TailCompiler,
  texts: readonly string[],
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
      text: `${text}；补充具体分析方法NEAR；覆盖明确执行范围PASS；补充过长执行细节XXL；补充TINY`,
      sourceMessageTimestamp: index,
      createdAt: "2026-08-19T00:00:00.000Z",
    })),
  } as unknown as ResumeWorkspace;
}

function bulletId(index: number): string {
  return ["a", "b", "c"][index] ?? `tail-${index + 1}`;
}
