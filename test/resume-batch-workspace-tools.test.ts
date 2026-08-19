import assert from "node:assert/strict";
import test from "node:test";

import { evidenceForModel } from "../src/resume/workspace/agent-workspace-evidence.js";
import { applyAgentResumeContent } from "../src/resume/workspace/agent-content-applier.js";
import { resumeContentProgressKey } from "../src/resume/workspace/agent-progress-key.js";
import { resumeAgentNextAction } from "../src/resume/workspace/agent-next-action.js";
import { resumeWriteRejection } from "../src/resume/workspace/agent-write-rejection.js";
import { buildResumeSkeleton } from "../src/resume/workspace/candidate-skeleton.js";
import { bulletCharacterTargets } from "../src/resume/workspace/character-targets.js";
import { groundedAdditionTargets } from "../src/resume/workspace/grounded-addition-targets.js";
import { resumeGenerationReadiness } from "../src/resume/workspace/generation-readiness.js";
import { selectLineRewrites } from "../src/resume/workspace/line-rewrite-selector.js";
import { retainContentAcrossSourceExpansion } from "../src/resume/workspace/source-reselection.js";
import {
  concreteExpansionHints,
  tailRepairBatch,
} from "../src/resume/workspace/tail-repair-targets.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from "../src/tools/agent-orchestrated/apply-content.js";
import { createAddResumeMaterialTool } from "../src/tools/agent-orchestrated/add-material.js";
import { createResumeWorkspaceTool } from "../src/tools/agent-orchestrated/create-workspace.js";
import { createGetResumeWorkspaceTool } from "../src/tools/agent-orchestrated/get-workspace.js";
import { applyContentParameters } from "../src/tools/agent-orchestrated/apply-content-parameters.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
  WORK_CONTENT,
} from "./support/resume-workspace-fixture.js";

function harness(compiler = new FixtureResumeCompiler()) {
  const builder = createWorkspaceSnapshotBuilder();
  const store = new ResumeWorkspaceStore();
  return {
    builder,
    compiler,
    store,
    create: createResumeWorkspaceTool(builder, compiler, store),
    get: createGetResumeWorkspaceTool(store),
    apply: createApplyResumeContentTool(compiler, store),
  };
}

class ProgressiveTailCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    const texts = new Map(structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, bullet.text] as const)
      )
    ));
    const improvingIds = result.bullets.filter((bullet) =>
      texts.get(bullet.bulletId)?.includes("逐步改善")
    ).map((bullet) => bullet.bulletId);
    if (!improvingIds.length) return result;
    const improving = new Set(improvingIds);
    return {
      ...result,
      qualified: false,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 950,
      availableHeightPx: 1000,
      usageRatio: 0.95,
      bullets: result.bullets.map((bullet) => improving.has(bullet.bulletId)
        ? { ...bullet, passed: false, lastLineWidthPx: 360, lastLineRatio: 0.6 }
        : bullet),
      violations: [
        ...result.violations.filter((violation) =>
          !violation.bulletId || !improving.has(violation.bulletId)
        ),
        ...improvingIds.map((bulletId) => ({
          code: "bullet_tail_too_short" as const,
          message: "improving tail",
          bulletId,
        })),
      ],
    };
  }
}

class NoTailProgressCompiler extends FixtureResumeCompiler {
  public forcedLineCounts = new Map<string, number>();

  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    if (!this.forcedLineCounts.size) return result;
    const bullets = result.bullets.map((bullet) => ({
      ...bullet,
      lineCount: this.forcedLineCounts.get(bullet.bulletId) ?? bullet.lineCount,
      passed: false,
      lastLineWidthPx: 200,
      availableLineWidthPx: 600,
      lastLineRatio: 1 / 3,
    }));
    return {
      ...result,
      qualified: false,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 950,
      availableHeightPx: 1000,
      usageRatio: 0.95,
      bullets,
      violations: bullets.map((bullet) => ({
        code: "bullet_tail_too_short" as const,
        message: "short tail",
        bulletId: bullet.bulletId,
      })),
    };
  }
}

class SameLineGrowthCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    const texts = new Map(structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, bullet.text] as const)
      )
    ));
    const rewritten = result.bullets.filter((bullet) =>
      texts.get(bullet.bulletId)?.endsWith("并细化处理方法")
    );
    if (!rewritten.length) return result;
    const rewrittenIds = new Set(rewritten.map((bullet) => bullet.bulletId));
    return {
      ...result,
      qualified: false,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 840,
      availableHeightPx: 1000,
      usageRatio: 0.84,
      bullets: result.bullets.map((bullet) => rewrittenIds.has(bullet.bulletId)
        ? { ...bullet, lineCount: 2, passed: false, lastLineRatio: 0.6 }
        : bullet),
      violations: [{ code: "page_underfilled" as const, message: "underfilled" }],
    };
  }
}

class DepthStackingCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    const texts = new Map(structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, bullet.text] as const)
      )
    ));
    const stackedIds = new Set(result.bullets.filter((bullet) =>
      texts.get(bullet.bulletId)?.endsWith("并细化处理方法")
    ).map((bullet) => bullet.bulletId));
    if (!stackedIds.size) return result;
    return {
      ...result,
      qualified: true,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 930,
      availableHeightPx: 1000,
      usageRatio: 0.93,
      bullets: result.bullets.map((bullet) => stackedIds.has(bullet.bulletId)
        ? {
            ...bullet,
            lineCount: 1,
            lastLineWidthPx: 560,
            lastLineRatio: 560 / 600,
            passed: true,
          }
        : bullet),
      violations: [],
    };
  }
}

class MinimalOverflowCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    const bulletCount = structure.sections.flatMap((section) =>
      section.items.filter((item) => item.id === "item-work-1")
        .flatMap((item) => item.bullets)
    ).length;
    const usageRatio = 0.9 + bulletCount * 0.03;
    const overflowPx = Math.max(0, usageRatio * 1000 - 1000);
    const violations = overflowPx > 0
      ? [{ code: "page_overflow" as const, message: "slight overflow" }]
      : usageRatio < 0.92
        ? [{ code: "page_underfilled" as const, message: "underfilled" }]
        : [];
    return {
      ...result,
      qualified: violations.length === 0,
      pageCount: overflowPx > 0 ? 2 : 1,
      overflowPx,
      usedHeightPx: usageRatio * 1000,
      availableHeightPx: 1000,
      bodyLineHeightPx: 20,
      usageRatio,
      bullets: result.bullets.map((bullet, index) => ({
        ...bullet,
        lineCount: index === 0 ? 3 : 2,
        lastLineWidthPx: 480,
        lastLineRatio: 0.8,
        passed: true,
      })),
      violations,
    };
  }
}

class AlwaysOverflowCompiler extends MinimalOverflowCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    return {
      ...result,
      qualified: false,
      pageCount: 2,
      overflowPx: 20,
      usedHeightPx: 1020,
      usageRatio: 1.02,
      violations: [{ code: "page_overflow" as const, message: "overflow" }],
    };
  }
}

class StablePageCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    return {
      ...result,
      qualified: true,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 950,
      availableHeightPx: 1000,
      usageRatio: 0.95,
      violations: [],
    };
  }
}

function text(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}

test("height expansion crosses one line before requiring a passing new tail", () => {
  const targets = bulletCharacterTargets("示".repeat(73), 2, 26, 711);
  assert.ok(targets);
  assert.ok(
    targets.addOneLineAnyTail.minimum < targets.addExactlyOneLine.minimum,
  );
  assert.ok(targets.addOneLineAnyTail.minimum > 73);
  assert.equal(
    targets.addOneLineAnyTail.maximum,
    targets.addExactlyOneLine.minimum,
  );
});

test("tail repair schema leaves the authoritative target count to nextAction", () => {
  const schema = applyContentParameters.properties.tailRepairs as {
    maxItems?: number;
    items?: { properties?: Record<string, unknown> };
  };
  assert.equal(schema.maxItems, undefined);
  assert.ok(schema.items?.properties?.revisedText);
  assert.equal(schema.items?.properties?.augmentedModifier, undefined);
  assert.equal(schema.items?.properties?.groundedCandidates, undefined);
  assert.equal(schema.items?.properties?.groundedModifiers, undefined);
  const removals = applyContentParameters.properties.bulletRemovals as {
    maxItems?: number;
  };
  assert.equal(removals.maxItems, 1);
});

test("CJK tail targets use body-font width instead of narrow mixed-text average", () => {
  const text = "使用 SQL 分析 180,000 条数据并修复埋点问题".repeat(4);
  const averageOnly = bulletCharacterTargets(text, 2, 80, 600);
  const cjkCalibrated = bulletCharacterTargets(text, 2, 80, 600, 13 * 0.95);

  assert.ok(averageOnly && cjkCalibrated);
  assert.ok(
    cjkCalibrated.passCurrentLineCount.maximum <
      averageOnly.passCurrentLineCount.maximum,
  );
});

test("tail repair keeps the complete grounded clause available", () => {
  assert.deepEqual(concreteExpansionHints(
    ["按获客渠道拆分 12 个核心指标并核对埋点口径"],
    "拆分 12 个指标并核对口径",
  ), ["按获客渠道拆分 12 个核心指标并核对埋点口径"]);
});

test("workspace creation applies the Agent translation without another generation stage", async () => {
  const value = harness();
  const created = text(await value.create.execute("localized-position", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{
      experienceId: "work-1",
      tier: "main",
      localizedPosition: "数据产品分析实习生",
    }],
  }));
  const item = created.resume.items.find(
    (entry: { itemId: string }) => entry.itemId === "item-work-1",
  );
  assert.equal(item.title, "数据产品分析实习生");
  assert.equal(item.role, "数据团队");
  assert.equal(
    value.compiler.structures[0]!.sections
      .find((section) => section.type === "experience")!.items[0]!.title,
    "数据产品分析实习生",
  );
});

test("workspace creation validates and applies Agent-identified education coursework", async () => {
  const builder = createWorkspaceSnapshotBuilder({
    educationContent:
      "英语（含核心金融课程） · GPA 3.89/4.0\n课程：International Law, Economics",
  });
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(builder, compiler, store);
  const created = text(await create.execute("education-coursework", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
    educationCoursework: [{
      experienceId: "edu-1",
      sourceQuote: "课程：International Law, Economics",
      courses: ["International Law", "Economics"],
    }],
  }));

  assert.equal(created.sourceSelection.mode, "created");
  assert.equal(created.resume.items.find(
    (item: { itemId: string }) => item.itemId === "item-edu-1",
  ).rawText, "GPA 3.89/4.0\n主修课程：International Law, Economics");
  assert.equal(
    store.latest()!.structure.sections.find((section) =>
      section.type === "education"
    )!.items[0]!.raw_text,
    "GPA 3.89/4.0\n主修课程：International Law, Economics",
  );
});

test("workspace creation rejects education coursework without an exact source quote", async () => {
  const value = harness();
  const rejected = text(await value.create.execute("fabricated-coursework", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
    educationCoursework: [{
      experienceId: "edu-1",
      sourceQuote: "课程：机器学习",
      courses: ["机器学习"],
    }],
  }));

  assert.equal(rejected.status, "rejected");
  assert.match(rejected.writeRejectedReason, /sourceQuote.*原始教育经历/u);
  assert.equal(value.store.latest(), undefined);
});

test("slight overflow removes only one extra bullet before any source reduction", async () => {
  const builder = createWorkspaceSnapshotBuilder({
    workContent: `${WORK_CONTENT}补充访谈 8 名业务用户并整理需求优先级。`,
    tinyWorkContent: "负责日常数据整理。维护周度报表并核对异常数据。",
  });
  const compiler = new MinimalOverflowCompiler();
  const store = new ResumeWorkspaceStore();
  const value = {
    builder,
    compiler,
    store,
    create: createResumeWorkspaceTool(builder, compiler, store),
    get: createGetResumeWorkspaceTool(store),
    apply: createApplyResumeContentTool(compiler, store),
  };
  const created = text(await value.create.execute("create-overflow", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  }));
  const written = text(await value.apply.execute("write-overflow", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [
      { itemId: "item-work-1", bullets: workBullets(value).slice(0, 4) },
      { itemId: "item-tiny-work-1", bullets: tinyWorkBullets(value) },
    ],
  }));
  const action = written.nextAction;
  assert.equal(action.mode, "reduce_overflow");
  assert.equal(action.requiredInput, "bulletRemovals");
  assert.equal(action.bodyLinesToRemove, 1);
  assert.equal(action.maximumRemovedBullets, 1);
  assert.equal(action.bulletRemovalTargets.length, 4);
  assert.equal(
    action.bulletRemovalTargets.every((target: { lineCount: number }) =>
      target.lineCount === 2
    ),
    true,
  );

  const sourceDrop = text(await value.create.execute("premature-source-drop", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  assert.match(sourceDrop.writeRejectedReason, /bulletRemovals/u);
  assert.equal(value.store.latest()!.revision, written.revision);

  const tierDowngrade = text(await value.create.execute("premature-tier-change", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "secondary" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  }));
  assert.match(tierDowngrade.writeRejectedReason, /bulletRemovals/u);
  assert.equal(value.store.latest()!.revision, written.revision);

  const longerBulletId = value.store.latest()!.compileResult.bullets
    .find((bullet) => bullet.lineCount === 3)!.bulletId;
  assert.equal(
    action.bulletRemovalTargets.some(
      (target: { bulletId: string }) => target.bulletId === longerBulletId,
    ),
    false,
  );
  const longerRemoval = text(await value.apply.execute("remove-longer-bullet", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    bulletRemovals: [{ bulletId: longerBulletId }],
  }));
  assert.match(longerRemoval.writeRejectedReason, /bulletRemovalTargets/u);
  assert.equal(longerRemoval.revision, written.revision);

  const tooMany = text(await value.apply.execute("too-many-removals", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    bulletRemovals: action.bulletRemovalTargets.slice(0, 2).map(
      (target: { bulletId: string }) => ({ bulletId: target.bulletId }),
    ),
  }));
  assert.match(tooMany.writeRejectedReason, /最多删除 1 条/u);
  assert.equal(tooMany.revision, written.revision);

  const removedId = action.bulletRemovalTargets[0].bulletId;
  const reduced = text(await value.apply.execute("minimal-removal", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    bulletRemovals: [{ bulletId: removedId }],
  }));
  assert.equal(reduced.revision, written.revision + 1);
  assert.equal(reduced.layout.pageCount, 1);
  assert.equal(reduced.layout.usageRatio, 0.99);
  assert.equal(value.store.latest()!.structure.sections.flatMap((section) =>
    section.items.find((item) => item.id === "item-work-1")?.bullets ?? []
  ).length, 3);
});

test("whole-experience overflow fallback removes at most one source", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new AlwaysOverflowCompiler();
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(builder, compiler, store);
  const created = text(await create.execute("create-source-fallback", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
      { experienceId: "legacy-skills-1", tier: "utility" },
    ],
  }));
  assert.equal(created.nextAction.mode, "reduce_overflow");
  assert.equal(created.nextAction.requiredInput, "reselectWithoutOneExperience");

  const overbroad = text(await create.execute("remove-two-sources", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  assert.match(overbroad.writeRejectedReason, /必须且只能移除 1 段非教育经历/u);
  assert.equal(store.latest()!.revision, created.revision);

  const changedTier = text(await create.execute("change-retained-tier", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "secondary" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  }));
  assert.match(changedTier.writeRejectedReason, /不得改变.*分级/u);
  assert.equal(store.latest()!.revision, created.revision);

  const oneSource = text(await create.execute("remove-one-source", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  }));
  assert.equal(oneSource.sourceSelection.mode, "reselected");
  assert.equal(store.latest()!.revision, created.revision + 1);
});

test("grounded addition count does not truncate the Agent candidate pool", async () => {
  const value = harness();
  await createWorkspace(value);
  const workspace = value.store.latest()!;
  const one = groundedAdditionTargets(workspace, 1);
  const options = groundedAdditionTargets(workspace, 12);
  assert.equal(one.length, 1);
  assert.ok(options.length > one.length);
});

async function createWorkspace(value: ReturnType<typeof harness>) {
  return text(
    await value.create.execute("create", {
      jdId: "jd-1",
      language: "zh-CN",
      experiences: [
        { experienceId: "edu-1" },
        { experienceId: "work-1", tier: "main" },
      ],
    }),
  );
}

function workBullets(value: ReturnType<typeof harness>) {
  const workspace = value.store.latest()!;
  const evidence = evidenceForModel(workspace.sourceSnapshot).filter(
    (entry) => entry.experienceId === "work-1",
  );
  return evidence.map((entry) => ({
    text: entry.text.at(-1) === "。" ? entry.text.slice(0, -1) : entry.text,
    origin: "grounded" as const,
    evidenceIds: [entry.evidenceId],
    requirementIds: ["req-1"],
  }));
}

function tinyWorkBullets(value: ReturnType<typeof harness>) {
  const evidence = evidenceForModel(value.store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "tiny-work-1");
  return evidence.map((entry) => ({
    text: entry.text.at(-1) === "。" ? entry.text.slice(0, -1) : entry.text,
    origin: "grounded" as const,
    evidenceIds: [entry.evidenceId],
    requirementIds: ["req-1"],
  }));
}

test("create_resume_workspace locks all sources and measures only the blank page", async () => {
  const value = harness();
  const payload = await createWorkspace(value);

  assert.equal(value.compiler.structures.length, 1);
  assert.equal(payload.revision, 0);
  assert.equal(payload.source.jd.id, "jd-1");
  assert.equal(payload.source.experiences.length, 2);
  assert.equal("content" in payload.source.experiences[0], false);
  assert.ok(payload.availableEvidence.length > 0);
  assert.equal(payload.resume.items.find((item: { itemId: string }) =>
    item.itemId === "item-work-1").tier, "main");
  assert.equal(value.store.latest()!.structure.layout_target_band?.maximum, 1);
  assert.equal("estimatedMaxUsageRatio" in payload, false);
  assert.equal("writePlan" in payload, false);
  assert.equal(payload.status, "writing");
  assert.equal(payload.layout.additionalBodyLinesToMinimum, 10);
  assert.equal(payload.wholePageBudget.minimumBodyLinesToAdd, 10);
  assert.equal(payload.wholePageBudget.preferredBodyLinesToAdd, 12);
  assert.equal(payload.wholePageBudget.maximumBodyLinesToAdd, 14);
  assert.equal(payload.wholePageBudget.remainingMinimumBullets, 3);
  assert.equal(payload.wholePageBudget.minimumLinesPerTieredBullet, 2);
  assert.equal(payload.wholePageBudget.maximumLinesPerTieredBullet, 3);
  assert.equal(payload.wholePageBudget.minimumBodyLinesForMinimumBullets, 6);
  assert.deepEqual(payload.wholePageBudget.itemMinimums, [{
    itemId: "item-work-1",
    tier: "main",
    currentBulletCount: 0,
    minimumBulletCount: 3,
    remainingMinimumBullets: 3,
  }]);
  assert.equal(payload.readiness.ready, false);
  assert.equal(payload.nextAction.mode, "repair_bullet_counts");
  assert.equal(payload.nextAction.requiredInput, "items");
  assert.equal(payload.nextAction.itemTargets.length, 1);
  assert.equal(payload.nextAction.itemTargets[0].missingBulletCount, 3);
  assert.equal(payload.nextAction.itemTargets[0].availableEvidence.length, 3);
  assert.equal(payload.nextAction.itemTargets[0].currentBullets.length, 0);
});

test("bullet count repair pauses before retrying an evidence-poor item", async () => {
  const value = harness();
  const payload = text(await value.create.execute("insufficient-count-evidence", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  }));

  assert.equal(payload.nextAction.mode, "request_more_material");
  assert.equal(payload.nextAction.targetExperienceId, "tiny-work-1");
  assert.match(payload.nextAction.question, /只有 1 条可独占事实/u);
  assert.match(payload.nextAction.question, /至少需要 2 条 bullet/u);

  const rejected = text(await value.apply.execute("do-not-retry-count", {
    candidateId: payload.candidateId,
    expectedRevision: payload.revision,
    items: [{ itemId: "item-tiny-work-1", bullets: [] }],
  }));
  assert.equal(rejected.revision, payload.revision);
  assert.match(rejected.writeRejectedReason, /等待用户补充素材/u);
});

test("bullet count repair rejects an incomplete multi-item batch", async () => {
  const builder = createWorkspaceSnapshotBuilder({
    tinyWorkContent: "负责日常数据整理。维护周度报表并核对异常数据。",
  });
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(builder, compiler, store);
  const apply = createApplyResumeContentTool(compiler, store);
  const created = text(await create.execute("create-complete-count-batch", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  }));
  const evidence = evidenceForModel(store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  const rejected = text(await apply.execute("incomplete-count-batch", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: evidence.map((entry) => ({
        text: entry.text.replace(/。$/u, ""),
        origin: "grounded",
        evidenceIds: [entry.evidenceId],
      })),
    }],
  }));

  assert.equal(rejected.revision, created.revision);
  assert.match(rejected.writeRejectedReason, /item-tiny-work-1/u);
  assert.match(rejected.writeRejectedReason, /一次 items 调用/u);
});

test("create_resume_workspace adds active education when the Agent omits it", async () => {
  const value = harness();
  const payload = text(await value.create.execute("create-without-education", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));

  assert.equal(payload.resume.items[0]?.itemId, "item-edu-1");
  assert.equal(payload.resume.items[0]?.sourceExperienceId, "edu-1");
  assert.equal(payload.sourceSelection.selectedExperienceCount, 2);
});

test("apply_resume_content cannot rewrite or remove fixed education", async () => {
  const value = harness();
  const workspace = await createWorkspace(value);
  const result = text(await value.apply.execute("rewrite-education", {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
    items: [{
      itemId: "item-edu-1",
      bullets: [{ text: "改写教育信息", origin: "agent_augmented" }],
    }],
  }));

  assert.equal(result.operation.status, "rejected");
  assert.match(
    result.operation.rejectedItems[0]?.reason ?? "",
    /教育信息由经历库固定展示/u,
  );
  assert.equal(value.store.latest()!.revision, workspace.revision);
  assert.ok(value.store.latest()!.structure.sections
    .find((section) => section.type === "education")
    ?.items.some((item) => item.id === "item-edu-1"));
});

test("apply_resume_content accepts an exact source experience id", async () => {
  const value = harness();
  const workspace = await createWorkspace(value);
  const result = text(
    await value.apply.execute("apply-by-experience", {
      candidateId: workspace.candidateId,
      expectedRevision: workspace.revision,
      items: [{ experienceId: "work-1", bullets: workBullets(value) }],
    }),
  );

  assert.equal(result.operation.appliedItemIds[0], "item-work-1");
  assert.equal(value.store.latest()!.structure.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")?.bullets.length, 3);
});

test("apply_resume_content rejects duplicate exclusive evidence ranges", async () => {
  const value = harness();
  const workspace = await createWorkspace(value);
  const bullets = workBullets(value);
  const duplicate = {
    ...bullets[0]!,
    text: `${bullets[0]!.text}并完成方法复盘`,
  };
  const result = text(await value.apply.execute("duplicate-evidence", {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [bullets[0]!, bullets[1]!, duplicate],
    }],
  }));

  assert.equal(result.operation.status, "rejected");
  assert.match(result.operation.rejectedItems[0].reason, /reuses.*reserved/u);
  assert.equal(value.store.latest()!.revision, workspace.revision);
  assert.equal(value.store.latest()!.bindings.length, 0);
});

test("apply_resume_content reports every invalid bullet in one item", async () => {
  const value = harness();
  const workspace = await createWorkspace(value);
  const bullets = workBullets(value);
  const result = text(await value.apply.execute("aggregate-bullet-errors", {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [{
        ...bullets[0]!,
        text: `${bullets[0]!.text}。`,
      }, {
        ...bullets[1]!,
        evidenceIds: [],
      }, {
        ...bullets[2]!,
        text: `${bullets[2]!.text}并虚构 999 个项目结果`,
      }],
    }],
  }));

  assert.equal(result.operation.status, "rejected");
  assert.equal(result.operation.rejectedItems[0].errors.length, 3);
  assert.deepEqual(
    result.operation.rejectedItems[0].errors.map(
      (error: { code: string }) => error.code,
    ),
    ["trailing_punctuation", "missing_evidence", "unsupported_numeric_claim"],
  );
  assert.match(result.operation.rejectedItems[0].reason, /句末标点/u);
  assert.match(result.operation.rejectedItems[0].reason, /至少一个有效 evidenceId/u);
  assert.match(result.operation.rejectedItems[0].reason, /999/u);
  assert.equal(value.store.latest()!.revision, workspace.revision);
});

test("item retry progress follows the remaining error set, not revision alone", async () => {
  const value = harness();
  const workspace = await createWorkspace(value);
  const bullets = workBullets(value);
  const execute = (punctuation: boolean, unsupportedNumber: number) =>
    value.apply.execute("item-retry-progress", {
      candidateId: workspace.candidateId,
      expectedRevision: workspace.revision,
      items: [{
        itemId: "item-work-1",
        bullets: [{
          ...bullets[0]!,
          text: `${bullets[0]!.text}${punctuation ? "。" : ""}`,
        }, {
          ...bullets[1]!,
          evidenceIds: [],
        }, {
          ...bullets[2]!,
          text: `${bullets[2]!.text}并虚构 ${unsupportedNumber} 个结果`,
        }],
      }],
    });

  const first = await execute(true, 999);
  const second = await execute(false, 999);
  const sameFailures = await execute(false, 998);
  const key = (result: typeof first) =>
    (result.details as { loopGuardKey: string }).loopGuardKey;

  assert.notEqual(key(first), key(second), "fixing one error is progress");
  assert.equal(
    key(second),
    key(sameFailures),
    "rewriting into the same validation failures is still no progress",
  );
  assert.equal(value.store.latest()!.revision, workspace.revision);
});

test("apply_resume_content infers one item from grounded evidence IDs", async () => {
  const value = harness();
  const workspace = await createWorkspace(value);
  const result = text(await value.apply.execute("apply-by-evidence", {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
    items: [{ bullets: workBullets(value) }],
  }));

  assert.equal(result.operation.appliedItemIds[0], "item-work-1");
  assert.equal(result.operation.rejectedItems.length, 0);
});

test("grounded writes auto-attach same-experience evidence that covers numbers", async () => {
  const value = harness();
  const workspace = await createWorkspace(value);
  const evidence = evidenceForModel(value.store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  const payload = text(await value.apply.execute("auto-cover-number", {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [{
        text: "使用 Python 清洗数据并为 3 个团队建立周度报表",
        origin: "grounded",
        evidenceIds: [evidence[0]!.evidenceId],
      }, ...workBullets(value).slice(2), {
        text: "主动复盘跨团队协作流程并沉淀可复用方法",
        origin: "agent_augmented",
      }],
    }],
  }));

  assert.equal(payload.operation.rejectedItems.length, 0);
  assert.equal(value.store.latest()!.bulletProvenance?.find(
    (entry) => entry.itemId === "item-work-1",
  )?.evidenceIds.length, 2);
});

test("apply_resume_content batch-updates bullet text without resending item metadata", async () => {
  const value = harness(new StablePageCompiler());
  const created = await createWorkspace(value);
  const written = text(
    await value.apply.execute("initial-content", {
      candidateId: created.candidateId,
      expectedRevision: created.revision,
      items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
    }),
  );
  const before = value.store.latest()!;
  const itemBefore = before.structure.sections.flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!;
  const target = itemBefore.bullets[0]!;
  const provenanceBefore = before.bulletProvenance?.find(
    (entry) => entry.bulletId === target.id,
  );
  const compileCount = value.compiler.structures.length;

  const updated = text(
    await value.apply.execute("tail-batch", {
      candidateId: created.candidateId,
      expectedRevision: written.revision,
      bulletUpdates: [{
        bulletId: target.id,
        text: `${target.text.replace(/[。.!?；;：:]$/u, "")}并形成复盘结论`,
      }],
    }),
  );

  const after = value.store.latest()!;
  const targetAfter = after.structure.sections.flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets[0]!;
  const provenanceAfter = after.bulletProvenance?.find(
    (entry) => entry.bulletId === target.id,
  );
  assert.equal(updated.operation.status, "success");
  assert.equal(value.compiler.structures.length, compileCount + 1);
  assert.equal(targetAfter.id, target.id);
  assert.match(targetAfter.text, /形成复盘结论$/u);
  assert.deepEqual(provenanceAfter, provenanceBefore);
});

test("stale apply is a recoverable no-op with the current revision", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  const written = text(await value.apply.execute("initial-content", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  }));
  const target = value.store.latest()!.structure.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets[0]!;
  const compileCount = value.compiler.structures.length;

  const rejected = text(await value.apply.execute("future-revision", {
    candidateId: created.candidateId,
    expectedRevision: written.revision + 1,
    bulletUpdates: [{ bulletId: target.id, text: `${target.text}补充方法` }],
  }));

  assert.equal(rejected.revision, written.revision);
  assert.equal(value.store.latest()!.revision, written.revision);
  assert.equal(value.compiler.structures.length, compileCount);
  assert.match(rejected.writeRejectedReason, /草稿未修改/u);
  assert.match(rejected.writeRejectedReason, /不要自行递增/u);
});

test("create_resume_workspace expands one JD in place without duplicating its draft identity", async () => {
  const value = harness();
  const first = await createWorkspace(value);
  const expanded = text(
    await value.create.execute("expand", {
      jdId: "jd-1",
      language: "zh-CN",
      experiences: [
        { experienceId: "edu-1" },
        { experienceId: "work-1", tier: "main" },
        { experienceId: "tiny-work-1", tier: "secondary" },
      ],
    }),
  );

  assert.equal(expanded.candidateId, first.candidateId);
  assert.equal(expanded.revision, 1);
  assert.equal(expanded.sourceSelection.mode, "reselected");
  assert.equal(expanded.sourceSelection.selectedExperienceCount, 3);
  assert.deepEqual(expanded.sourceSelection.newItemIds, ["item-tiny-work-1"]);
  assert.equal(
    expanded.sourceSelection.nextWriteScope,
    "write_all_new_items_only_then_compile",
  );
  assert.equal(
    expanded.availableEvidence.some(
      (entry: { experienceId: string }) => entry.experienceId === "tiny-work-1",
    ),
    true,
  );
  assert.equal(value.compiler.structures.length, 2);

  const unchanged = text(
    await value.create.execute("same-again", {
      jdId: "jd-1",
      language: "zh-CN",
      experiences: [
        { experienceId: "edu-1" },
        { experienceId: "work-1", tier: "main" },
        { experienceId: "tiny-work-1", tier: "secondary" },
      ],
    }),
  );
  assert.equal(unchanged.candidateId, first.candidateId);
  assert.equal(unchanged.revision, 1);
  assert.equal(unchanged.sourceSelection.mode, "unchanged");
  assert.equal(value.compiler.structures.length, 2);
});

test("source expansion retains user-provided facts for selected experiences", async () => {
  const value = harness(new StablePageCompiler());
  const first = await createWorkspace(value);
  const written = text(
    await value.apply.execute("content-before-expand", {
      candidateId: first.candidateId,
      expectedRevision: first.revision,
      items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
    }),
  );
  const add = createAddResumeMaterialTool(value.store, () => 1_234_567);
  const added = text(
    await add.execute("material-before-expand", {
      candidateId: first.candidateId,
      expectedRevision: written.revision,
      experienceId: "work-1",
      facts: ["补充了真实的用户访谈方法"],
    }),
  );
  const expanded = text(
    await value.create.execute("expand-after-material", {
      jdId: "jd-1",
      language: "zh-CN",
      experiences: [
        { experienceId: "edu-1" },
        { experienceId: "work-1", tier: "main" },
        { experienceId: "tiny-work-1", tier: "secondary" },
      ],
    }),
  );

  assert.equal(expanded.candidateId, first.candidateId);
  assert.equal(expanded.revision, added.revision + 1);
  assert.equal(
    expanded.availableEvidence.some(
      (entry: { text: string }) => entry.text === "补充了真实的用户访谈方法",
    ),
    true,
  );
  const retainedItem = value.store.latest()!.structure.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1");
  assert.equal(retainedItem?.bullets.length, 3);
  assert.equal(value.store.latest()!.bindings.length, 3);
  assert.equal(value.store.latest()!.bulletProvenance?.length, 3);
  assert.equal(value.store.latest()!.contentApplyCount, 0);
  assert.equal(value.compiler.structures.at(-1)?.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")?.bullets.length, 3);
});

test("source expansion drops bullets whose source revision changed", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  await value.apply.execute("write-before-source-change", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const previous = value.store.latest()!;
  const nextSnapshot = {
    ...previous.sourceSnapshot,
    experiences: previous.sourceSnapshot.experiences.map((experience) =>
      experience.id === "work-1"
        ? { ...experience, contentHash: "sha256:changed" }
        : experience,
    ),
  };
  const fresh = buildResumeSkeleton(
    nextSnapshot,
    ["edu-1", "work-1"],
    "zh-CN",
  );
  const retained = retainContentAcrossSourceExpansion(
    fresh,
    previous,
    nextSnapshot,
  );

  assert.equal(retained.structure.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")?.bullets.length, 0);
  assert.equal(retained.bindings.length, 0);
  assert.equal(retained.bulletProvenance.length, 0);
});

test("apply_resume_content replaces a complete item batch and compiles once", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  const execution = await value.apply.execute("apply", {
    candidateId: created.candidateId,
    expectedRevision: 0,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const payload = text(execution);

  assert.equal(value.compiler.structures.length, 2);
  assert.equal(payload.revision, 1);
  assert.equal(payload.operation.status, "success");
  assert.equal("loopGuardKey" in payload, false);
  assert.match(
    String((execution.details as { loopGuardKey?: string }).loopGuardKey),
    /^resume_content_apply:[a-f0-9]{64}$/u,
  );
  assert.deepEqual(payload.operation.appliedItemIds, ["item-work-1"]);
  assert.equal(value.store.latest()!.structure.sections.flatMap(
    (section) => section.items,
  ).find((item) => item.id === "item-work-1")?.bullets.length, 3);
  assert.equal(payload.layout.observedRevision, 1);
  assert.equal(payload.layout.gates.bulletCountsPassed, true);
  assert.equal("resume" in payload, false);
  assert.match(payload.recovery, /get_resume_workspace/u);
});

test("tail repair requires one complete batch before per-bullet validation", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  const written = text(await value.apply.execute("initial-content", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  }));
  const workspace = value.store.latest()!;
  const failed = workspace.compileResult.bullets.slice(0, 2).map(
    (bullet) => bullet.bulletId,
  );
  const originals = new Map(
    workspace.structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets.map((bullet) => [
        bullet.id,
        bullet.text,
      ] as const)),
    ),
  );
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        if (failed.includes(bullet.id)) bullet.text += "短尾";
      }
    }
  }
  workspace.compileResult = {
    ...workspace.compileResult,
    qualified: false,
    pageCount: 1,
    overflowPx: 0,
    usedHeightPx: 950,
    availableHeightPx: 1000,
    usageRatio: 0.95,
    bullets: workspace.compileResult.bullets.map((bullet) => ({
      ...bullet,
      passed: !failed.includes(bullet.bulletId),
    })),
    violations: failed.map((bulletId) => ({
      code: "bullet_tail_too_short" as const,
      message: "short tail",
      bulletId,
    })),
  };
  const internalTailTargets = new Map(tailRepairBatch(workspace).targets.map(
    (target) => [target.bulletId, target] as const,
  ));
  value.store.restore(workspace);
  const compileCount = value.compiler.structures.length;
  assert.match(resumeWriteRejection(workspace, {
    tailRepairs: [{
      bulletId: failed[0]!,
      revisedText: `${originals.get(failed[0]!)}短尾，补充具体方法`,
    }],
  }) ?? "", /必须用一次 tailRepairs.*missing=/u);

  const rejected = text(await value.apply.execute("incomplete-tail-batch", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRepairs: [{
      bulletId: failed[0]!,
      revisedText: `${originals.get(failed[0]!)}短尾，补充具体方法`,
    }],
  }));

  assert.equal(value.compiler.structures.length, compileCount);
  assert.equal(rejected.revision, written.revision);
  assert.match(rejected.writeRejectedReason, /missing=/u);
  assert.equal(rejected.nextAction.mode, "batch_tail_repair");
  assert.deepEqual(
    new Set(rejected.nextAction.bulletIds),
    new Set(failed),
  );
  assert.ok(rejected.nextAction.tailRepairTargets.every(
    (target: {
      requiredEdit: string;
      bulletId: string;
      currentText: string;
      currentLineCount: number;
      expansionGoal: string;
      concreteExpansionHints: string[];
      sourceQuotes: string[];
    }) =>
      target.currentText.length > 0 &&
      target.currentLineCount >= 1 &&
      target.sourceQuotes.length > 0 &&
      /本轮语义目标/u.test(target.requiredEdit) &&
      /无需计算字符或像素/u.test(target.requiredEdit) &&
      /保持 currentText 当前实测的 \d+ 行/u.test(target.requiredEdit) &&
      target.expansionGoal ===
        internalTailTargets.get(target.bulletId)!.expansionGoal &&
      Array.isArray(target.concreteExpansionHints),
  ));
  assert.ok(rejected.nextAction.tailRepairTargets.every(
    (target: Record<string, unknown>) =>
      !("evidenceIds" in target) && !("retryGuidance" in target) &&
      !("strategy" in target) &&
      !("editInstruction" in target) &&
      !("minimumFinalCharacters" in target) &&
      !("preferredFinalCharacters" in target) &&
      !("maximumFinalCharacters" in target),
  ));
  assert.equal("optionLimits" in rejected.nextAction, false);
  assert.equal(rejected.nextAction.remainingTailCount, failed.length);

  type ModelTarget = { bulletId: string; currentText: string };
  const modelTargets = new Map<string, ModelTarget>((
    rejected.nextAction.tailRepairTargets as ModelTarget[]
  ).map((target) => [target.bulletId, target]));
  const revisedById = new Map(failed.map((bulletId) => {
    const target = modelTargets.get(bulletId)!;
    const addition = "补充具体方法范围说明过程依据对象流程边界协作关系业务场景约束条件验收标准";
    return [bulletId, `${target.currentText}${addition}`] as const;
  }));
  const partial = text(await value.apply.execute("batch-tail-repairs", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRepairs: failed.map((bulletId) => ({
      bulletId,
      revisedText: revisedById.get(bulletId)!,
    })),
  }));
  assert.equal(partial.revision, written.revision + 1);
  assert.equal("writeRejectedReason" in partial, false);
  assert.ok(value.compiler.structures.length >= compileCount + 2);
  const partialTexts = value.store.latest()!.structure.sections.flatMap(
    (section) => section.items.flatMap((item) => item.bullets),
  );
  assert.equal(partialTexts.find((bullet) =>
    bullet.id === failed[0])?.text, revisedById.get(failed[0]!));
  assert.equal(partialTexts.find((bullet) =>
    bullet.id === failed[1])?.text, revisedById.get(failed[1]!));
});

test("model-facing tail repair batches eight targets without dropping the ledger", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  await value.apply.execute("initial-content", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const workspace = value.store.latest()!;
  const item = workspace.structure.sections.flatMap((section) => section.items)
    .find((entry) => entry.id === "item-work-1")!;
  const templateBullet = item.bullets[0]!;
  const templateMeasurement = workspace.compileResult.bullets.find(
    (bullet) => bullet.bulletId === templateBullet.id,
  )!;
  const templateProvenance = workspace.bulletProvenance!.find(
    (entry) => entry.bulletId === templateBullet.id,
  )!;
  const clones = Array.from({ length: 12 }, (_, index) => ({
    ...structuredClone(templateBullet),
    id: `tail-target-${index + 1}`,
  }));
  item.bullets = clones;
  workspace.bulletProvenance = clones.map((bullet) => ({
    ...structuredClone(templateProvenance),
    bulletId: bullet.id,
  }));
  workspace.compileResult = {
    ...workspace.compileResult,
    qualified: false,
    pageCount: 1,
    overflowPx: 0,
    usedHeightPx: 950,
    availableHeightPx: 1000,
    usageRatio: 0.95,
    bullets: clones.map((bullet) => ({
      ...templateMeasurement,
      bulletId: bullet.id,
      lineCount: 2,
      lastLineWidthPx: 180,
      availableLineWidthPx: 600,
      lastLineRatio: 0.3,
      passed: false,
    })),
    violations: clones.map((bullet) => ({
      code: "bullet_tail_too_short" as const,
      message: "short tail",
      bulletId: bullet.id,
    })),
  };

  assert.equal(tailRepairBatch(workspace).targets.length, 12);
  const nextAction = resumeAgentNextAction(workspace);
  assert.equal(nextAction.mode, "batch_tail_repair");
  if (nextAction.mode !== "batch_tail_repair") return;
  assert.equal(nextAction.bulletIds.length, 8);
  assert.equal(nextAction.tailRepairTargets.length, 8);
  assert.equal(nextAction.remainingTailCount, 12);
});

test("zero-progress tail repair keeps formal text and advances the stall counter", async () => {
  const compiler = new NoTailProgressCompiler();
  const value = harness(compiler);
  const created = await createWorkspace(value);
  const written = text(await value.apply.execute("initial-content", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  }));
  const workspace = value.store.latest()!;
  const failed = workspace.compileResult.bullets.map((bullet) => bullet.bulletId);
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) bullet.text += "短尾";
    }
  }
  workspace.compileResult = {
    ...workspace.compileResult,
    qualified: false,
    pageCount: 1,
    overflowPx: 0,
    usedHeightPx: 950,
    availableHeightPx: 1000,
    usageRatio: 0.95,
    bullets: workspace.compileResult.bullets.map((bullet) => ({
      ...bullet,
      passed: false,
      lastLineWidthPx: 200,
      availableLineWidthPx: 600,
      lastLineRatio: 1 / 3,
    })),
    violations: failed.map((bulletId) => ({
      code: "bullet_tail_too_short" as const,
      message: "short tail",
      bulletId,
    })),
  };
  value.store.restore(workspace);
  compiler.forcedLineCounts = new Map(workspace.compileResult.bullets.map(
    (bullet) => [bullet.bulletId, bullet.lineCount],
  ));
  const initialBatch = failed;
  const currentById = new Map(workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets.map((bullet) => [
      bullet.id,
      bullet.text,
    ] as const))
  ));

  const rejected = text(await value.apply.execute("zero-progress-tail", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRepairs: initialBatch.map((bulletId) => ({
      bulletId,
      revisedText: `${currentById.get(bulletId)}仍然短尾`,
    })),
  }));

  assert.equal(rejected.revision, written.revision);
  assert.equal(rejected.nextAction.mode, "batch_tail_repair");
  assert.equal(rejected.nextAction.bulletIds.length, failed.length);
  assert.ok(rejected.nextAction.bulletIds.every(
    (bulletId: string) => failed.includes(bulletId),
  ));
  assert.equal(rejected.tailRepairFeedback.length, initialBatch.length);
  assert.ok(rejected.tailRepairFeedback.every(
    (target: { status: string }) => target.status === "rejected",
  ));
  assert.ok(rejected.nextAction.tailRepairTargets.every((target: {
    currentText: string;
    expansionGoal: string;
  }) => target.currentText.length > 0 &&
    target.expansionGoal.length > 0));

  const second = text(await value.apply.execute("zero-progress-tail-recompose", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRepairs: initialBatch.map((bulletId) => ({
      bulletId,
      revisedText: `${currentById.get(bulletId)}，说明数据口径校验过程`,
    })),
  }));
  assert.equal(second.revision, written.revision);
  assert.ok(second.nextAction.tailRepairTargets.every(
    (target: Record<string, unknown>) => !("strategy" in target),
  ));

  const stalled = text(await value.apply.execute("zero-progress-tail-stalled", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRepairs: initialBatch.map((bulletId) => ({
      bulletId,
      revisedText: `${currentById.get(bulletId)}，重组数据清洗与口径校验过程`,
    })),
  }));
  assert.equal(stalled.revision, written.revision);
  assert.equal(stalled.nextAction.mode, "request_more_material");
  assert.equal("tailRepairReminder" in stalled, false);
  assert.match(stalled.terminalInstruction, /立即停止所有工具调用/u);
  assert.equal(value.store.latest()!.materialRequest?.kind, "tail_repair_stalled");
});

test("an improving tail revision is formally applied before it reaches 70 percent", async () => {
  const value = harness(new ProgressiveTailCompiler());
  const created = await createWorkspace(value);
  const written = text(await value.apply.execute("initial-progress-content", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  }));
  const workspace = value.store.latest()!;
  const target = workspace.structure.sections.flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets[0]!;
  const original = target.text;
  workspace.compileResult = {
    ...workspace.compileResult,
    qualified: false,
    pageCount: 1,
    overflowPx: 0,
    usedHeightPx: 950,
    availableHeightPx: 1000,
    usageRatio: 0.95,
    bullets: workspace.compileResult.bullets.map((bullet) =>
      bullet.bulletId === target.id
        ? { ...bullet, passed: false, lastLineWidthPx: 120, lastLineRatio: 0.2 }
        : bullet
    ),
    violations: [{ code: "bullet_tail_too_short", message: "short tail",
      bulletId: target.id }],
  };
  value.store.restore(workspace);
  const action = resumeAgentNextAction(workspace);
  assert.equal(action.mode, "batch_tail_repair");
  if (action.mode !== "batch_tail_repair") return;
  const lengthTarget = action.tailRepairTargets[0]!;
  assert.match(lengthTarget.expansionGoal, /具体/u);
  const addition = "逐步改善具体范围对象依据流程边界方法关系";
  const originalCharacters = [...original];
  const revised = [
    ...originalCharacters.slice(0, -1),
    ...addition,
    ...originalCharacters.slice(-1),
  ].join("");

  const advanced = text(await value.apply.execute("advance-tail-baseline", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRepairs: [{
      bulletId: target.id,
      revisedText: revised,
    }],
  }));

  assert.equal(advanced.revision, written.revision + 1);
  assert.equal(advanced.tailRepairDiagnostics.passedTargetCount, 0);
  assert.equal(advanced.tailRepairDiagnostics.progressedTargetCount, 1);
  assert.equal(advanced.nextAction.mode, "batch_tail_repair");
  assert.equal(advanced.nextAction.tailRepairTargets[0].currentText,
    revised);
  assert.ok(advanced.nextAction.tailRepairTargets[0].expansionGoal.length > 0);
  assert.equal(
    "minimumFinalCharacters" in advanced.nextAction.tailRepairTargets[0],
    false,
  );
  assert.equal(value.store.latest()!.structure.sections
    .flatMap((section) => section.items).find((item) =>
      item.id === "item-work-1"
    )!.bullets[0]!.text, revised);
});

test("a large tail deficit exposes one current-text repair instruction", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  const written = text(await value.apply.execute("initial-content", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  }));
  const workspace = value.store.latest()!;
  const target = workspace.structure.sections.flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets[0]!;
  const observed = workspace.compileResult.bullets.find(
    (bullet) => bullet.bulletId === target.id,
  )!;
  target.text = "使用 Python 清洗运营数据产品";
  workspace.compileResult = {
    ...workspace.compileResult,
    qualified: false,
    pageCount: 1,
    overflowPx: 0,
    usedHeightPx: 950,
    availableHeightPx: 1000,
    usageRatio: 0.95,
    bullets: workspace.compileResult.bullets.map((bullet) => ({
      ...bullet,
      passed: bullet.bulletId !== target.id,
      ...(bullet.bulletId === target.id
        ? { lineCount: 2, lastLineWidthPx: 10, availableLineWidthPx: 600 }
        : {}),
    })),
    violations: [{
      code: "bullet_tail_too_short",
      message: "short tail",
      bulletId: target.id,
    }],
  };
  value.store.restore(workspace);

  const repair = tailRepairBatch(workspace).targets[0]!;
  assert.equal(repair.bulletId, observed.bulletId);
  assert.ok(repair.sourceQuotes.length > 0);
  assert.match(repair.expansionGoal, /具体/u);
  assert.equal("currentCharacters" in repair, false);
  assert.equal("suggestedAddedCharacters" in repair, false);
  assert.equal("compactTotalCharacterTargets" in repair, false);
  assert.equal("addOneLineModifierCharacterTargets" in repair, false);

  assert.equal(written.revision, workspace.revision);
});

test("underfill lands exact extra lines before the final tail-repair phase", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  const written = text(await value.apply.execute("initial-content", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  }));
  const workspace = value.store.latest()!;
  workspace.compileResult = {
    ...workspace.compileResult,
    qualified: false,
    pageCount: 1,
    overflowPx: 0,
    usedHeightPx: 859,
    availableHeightPx: 1000,
    bodyLineHeightPx: 20,
    usageRatio: 0.859,
    bullets: workspace.compileResult.bullets.map((bullet) => ({
      ...bullet,
      passed: true,
      lastLineRatio: 0.8,
    })),
    violations: [{
      code: "page_underfilled" as const,
      message: "underfilled",
    }],
  };
  value.store.restore(workspace);
  const target = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[0]!;
  const validTarget = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[1]!;
  const fullerTarget = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[2]!;
  const compileCount = value.compiler.structures.length;

  const rejected = text(await value.apply.execute("blind-underfill-rewrite", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    bulletUpdates: [{ bulletId: target.id, text: `${target.text}补充方法` }],
  }));

  assert.equal(value.compiler.structures.length, compileCount);
  assert.equal(rejected.revision, written.revision);
  assert.equal(rejected.nextAction.mode, "increase_usage");
  assert.equal(rejected.nextAction.requiredInput, "lineRewrites");
  assert.equal(rejected.nextAction.additionalBodyLinesToMinimum, 3);
  assert.ok(Array.isArray(rejected.nextAction.groundedAdditionTargets));
  assert.ok(rejected.nextAction.lineExpansionTargets.length <= 8);
  assert.ok(rejected.nextAction.lineExpansionTargets.every(
    (entry: {
      currentText: string;
      evidenceIds: string[];
      sourceQuotes: string[];
      currentCharacters: number;
      characterDelta: number;
      targetCharacters: number;
    }) =>
      entry.currentText.length > 0 && entry.evidenceIds.length > 0 &&
      entry.sourceQuotes.length > 0 && entry.characterDelta > 0 &&
      entry.targetCharacters === entry.currentCharacters + entry.characterDelta,
  ));
  const expansionCosts = rejected.nextAction.lineExpansionTargets.map(
    (entry: { characterDelta: number }) => entry.characterDelta,
  );
  assert.deepEqual(expansionCosts, [...expansionCosts].sort((a, b) => a - b));
  assert.match(rejected.writeRejectedReason, /lineRewrites/u);

  const expanded = text(await value.apply.execute("underfill-line-rewrites", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    lineRewrites: [
      { bulletId: target.id, revisedText: target.text },
      {
        bulletId: validTarget.id,
        revisedText: `${validTarget.text}，增加一行短尾`,
      },
      {
        bulletId: fullerTarget.id,
        revisedText: `${fullerTarget.text}，增加一行短尾，补充处理方法`,
      },
    ],
  }));
  assert.equal(expanded.revision, written.revision + 1);
  assert.match(expanded.rewriteWarning, new RegExp(target.id));
  const expandedText = value.store.latest()!.structure.sections.flatMap(
    (section) => section.items.flatMap((item) => item.bullets),
  ).find((bullet) => bullet.id === validTarget.id)?.text ?? "";
  assert.equal(
    expandedText,
    `${validTarget.text}，增加一行短尾`,
    "fill the page first; repair the new short tail in the next phase",
  );
  const fullerText = value.store.latest()!.structure.sections.flatMap(
    (section) => section.items.flatMap((item) => item.bullets),
  ).find((bullet) => bullet.id === fullerTarget.id)?.text ?? "";
  assert.match(fullerText, /增加一行短尾，补充处理方法$/u);
});

test("underfill exposes unused grounded facts without blocking line expansion", async () => {
  const builder = createWorkspaceSnapshotBuilder({
    workContent: `${WORK_CONTENT}补充访谈 8 名业务用户并整理需求优先级。`,
  });
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const value = {
    builder,
    compiler,
    store,
    create: createResumeWorkspaceTool(builder, compiler, store),
    get: createGetResumeWorkspaceTool(store),
    apply: createApplyResumeContentTool(compiler, store),
  };
  const created = await createWorkspace(value);
  await value.apply.execute("three-grounded-bullets", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value).slice(0, 3) }],
  });
  const workspace = underfilledWorkspace(value.store.latest()!, 0.84);
  value.store.restore(workspace);

  const action = resumeAgentNextAction(workspace);
  assert.equal(action.mode, "increase_usage");
  if (action.mode !== "increase_usage") return;
  assert.equal(action.requiredInput, "bulletAdditionsOrLineRewrites");
  assert.ok(action.groundedAdditionTargets.some(
    (target) => target.sourceQuote.includes("访谈 8 名业务用户"),
  ));
});

test("a user-supplied fact becomes a page-fill bullet addition before line expansion", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  const written = text(await value.apply.execute("write-before-new-fact", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  }));
  value.store.restore(underfilledWorkspace(value.store.latest()!, 0.84));
  const add = createAddResumeMaterialTool(value.store, () => 55_555);
  await add.execute("new-grounded-page-fact", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    experienceId: "work-1",
    facts: ["组织 6 场用户访谈并形成产品需求优先级"],
  });

  const action = resumeAgentNextAction(value.store.latest()!);
  assert.equal(action.mode, "increase_usage");
  if (action.mode !== "increase_usage") return;
  assert.equal(action.requiredInput, "bulletAdditionsOrLineRewrites");
  assert.ok(action.groundedAdditionTargets.some(
    (target) => target.sourceQuote.includes("6 场用户访谈"),
  ));
});

test("an invalid page-fill rewrite does not count as a measured zero-growth round", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  await value.apply.execute("content-before-invalid-growth", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const workspace = underfilledWorkspace(value.store.latest()!, 0.84);
  value.store.restore(workspace);
  const target = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[0]!;

  const rejected = text(await value.apply.execute("invalid-growth", {
    candidateId: created.candidateId,
    expectedRevision: workspace.revision,
    lineRewrites: [{
      bulletId: target.id,
      revisedText: `${target.text}，增加一行并虚构 999 个项目结果`,
    }],
  }));

  assert.equal(rejected.revision, workspace.revision);
  assert.match(rejected.operation.rejectedItems[0].reason, /999/u);
  assert.equal(value.store.latest()!.pageFillProgress, undefined);
});

test("a valid same-line expansion is applied as the next rewrite baseline", async () => {
  const value = harness(new SameLineGrowthCompiler());
  const created = await createWorkspace(value);
  await value.apply.execute("content-before-stacked-growth", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const workspace = underfilledWorkspace(value.store.latest()!, 0.84);
  value.store.restore(workspace);
  const target = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[0]!;
  const revisedText = `${target.text}并细化处理方法`;

  const applied = text(await value.apply.execute("stack-same-line-growth", {
    candidateId: created.candidateId,
    expectedRevision: workspace.revision,
    lineRewrites: [{ bulletId: target.id, revisedText }],
  }));

  assert.equal(applied.revision, workspace.revision + 1);
  assert.equal(applied.lineRewriteDiagnostics.stackedProgressCount, 1);
  assert.equal(value.store.latest()!.pageFillProgress, undefined);
  const nextAction = applied.nextAction;
  assert.equal(nextAction.mode, "increase_usage");
  assert.ok(nextAction.lineExpansionTargets.some(
    (entry: { bulletId: string; currentText: string }) =>
      entry.bulletId === target.id && entry.currentText === revisedText,
  ));
});

test("two consecutive zero-growth page-fill rounds pause for user material", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  await value.apply.execute("complete-grounded-content", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [
      { itemId: "item-work-1", bullets: workBullets(value) },
      {
        itemId: "item-edu-1",
        bullets: [{
          text: "主修信息系统与数据分析",
          origin: "grounded",
          evidenceIds: ["edu-1:0:12"],
          requirementIds: [],
        }],
      },
    ],
  });
  const workspace = underfilledWorkspace(value.store.latest()!, 0.84);
  value.store.restore(workspace);
  const target = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[0]!;

  const first = text(await value.apply.execute("zero-growth-one", {
    candidateId: created.candidateId,
    expectedRevision: workspace.revision,
    lineRewrites: [{
      bulletId: target.id,
      revisedText: target.text,
    }],
  }));
  assert.equal(first.revision, workspace.revision);
  assert.equal(first.nextAction.mode, "increase_usage");
  assert.equal(value.store.latest()!.pageFillProgress?.consecutiveZeroGrowthRounds, 1);

  const second = text(await value.apply.execute("zero-growth-two", {
    candidateId: created.candidateId,
    expectedRevision: workspace.revision,
    lineRewrites: [{
      bulletId: target.id,
      revisedText: target.text,
    }],
  }));
  assert.equal(second.revision, workspace.revision);
  assert.equal(second.status, "needs_user_decision");
  assert.equal(second.nextAction.mode, "request_more_material");
  assert.match(second.nextAction.question, /具体职责|项目背景|方法|结果/u);
  assert.equal(second.materialRequest.kind, "page_fill_stalled");

  const add = createAddResumeMaterialTool(value.store, () => 66_666);
  const resumed = text(await add.execute("resume-after-page-stall", {
    candidateId: created.candidateId,
    expectedRevision: workspace.revision,
    experienceId: "work-1",
    facts: ["补充完成 5 场需求评审并记录关键决策"],
  }));
  assert.equal(resumed.status, "writing");
  assert.equal("materialRequest" in resumed, false);
  assert.equal(value.store.latest()!.pageFillProgress, undefined);
  assert.equal(resumed.nextAction.requiredInput, "bulletAdditionsOrLineRewrites");
});

test("underfill accepts one rewrite that safely crosses two lines", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  await value.apply.execute("initial-content", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const workspace = value.store.latest()!;
  const target = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[0]!;
  const optionalTarget = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[1]!;
  workspace.compileResult = {
    ...workspace.compileResult,
    qualified: false,
    pageCount: 1,
    overflowPx: 0,
    usedHeightPx: 880,
    availableHeightPx: 1000,
    bodyLineHeightPx: 20,
    usageRatio: 0.88,
    bullets: workspace.compileResult.bullets.map((bullet) =>
      bullet.bulletId === target.id
        ? { ...bullet, lineCount: 1 }
        : bullet,
    ),
  };
  const rewrite = `${target.text}，增加一行`;
  const optionalRewrite = `${optionalTarget.text}，增加一行`;

  const selected = await selectLineRewrites(workspace, [
    { bulletId: target.id, revisedText: rewrite },
    { bulletId: optionalTarget.id, revisedText: optionalRewrite },
  ], value.compiler);

  assert.deepEqual(selected.updates, [{ bulletId: target.id, text: rewrite }]);
  assert.match(selected.writeRejectedReason ?? "", new RegExp(optionalTarget.id));
});

test("one-line tiered bullets require one complete line-rewrite batch", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  await value.apply.execute("write-before-depth-gate", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const source = value.store.latest()!;
  const workItem = source.structure.sections.flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!;
  const firstBulletId = workItem.bullets[0]!.id;
  const secondBulletId = workItem.bullets[1]!.id;
  value.store.restore(withQualifiedLines(source, new Map([
    [firstBulletId, 1],
    [secondBulletId, 1],
  ])));

  const workspace = value.store.latest()!;
  assert.ok(resumeGenerationReadiness(workspace).blockers.some(
    (blocker) => blocker.code === "bullet_line_count_too_low" &&
      blocker.bulletId === firstBulletId,
  ));
  const action = resumeAgentNextAction(workspace);
  assert.equal(action.mode, "repair_bullet_depth");
  if (action.mode !== "repair_bullet_depth") return;
  assert.deepEqual(action.bulletIds, [firstBulletId, secondBulletId]);
  assert.equal(action.requiredInput, "lineRewrites");
  assert.equal(action.minimumLines, 2);
  assert.equal(action.maximumLines, 3);
  const target = action.lineRewriteTargets.find(
    (entry) => entry.bulletId === firstBulletId,
  );
  assert.ok(target);
  assert.ok(target.characterDelta > 0);
  assert.equal(
    target.targetCharacters,
    target.currentCharacters + target.characterDelta,
  );

  const wrongMode = text(await value.apply.execute("wrong-depth-mode", {
    candidateId: created.candidateId,
    expectedRevision: workspace.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  }));
  assert.match(wrongMode.writeRejectedReason, /repair_bullet_depth.*lineRewrites/u);
  assert.equal(wrongMode.revision, workspace.revision);

  const incomplete = text(await value.apply.execute("incomplete-depth-batch", {
    candidateId: created.candidateId,
    expectedRevision: workspace.revision,
    lineRewrites: [{
      bulletId: firstBulletId,
      revisedText: `${target.currentText}并细化处理方法`,
    }],
  }));
  assert.match(incomplete.writeRejectedReason, new RegExp(secondBulletId));
  assert.match(incomplete.writeRejectedReason, /missing=/u);
  assert.equal(incomplete.revision, workspace.revision);
});

test("same-line depth growth is applied and becomes the next repair baseline", async () => {
  const value = harness(new DepthStackingCompiler());
  const created = await createWorkspace(value);
  await value.apply.execute("write-before-stacked-depth", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const source = value.store.latest()!;
  const targetId = source.structure.sections.flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets[0]!.id;
  value.store.restore(withQualifiedLines(source, new Map([[targetId, 1]])));
  const workspace = value.store.latest()!;
  const action = resumeAgentNextAction(workspace);
  assert.equal(action.mode, "repair_bullet_depth");
  if (action.mode !== "repair_bullet_depth") return;
  const revisedText = `${action.lineRewriteTargets[0]!.currentText}并细化处理方法`;

  const applied = text(await value.apply.execute("stack-depth-growth", {
    candidateId: created.candidateId,
    expectedRevision: workspace.revision,
    lineRewrites: [{ bulletId: targetId, revisedText }],
  }));

  assert.equal(applied.revision, workspace.revision + 1);
  assert.equal(applied.lineRewriteDiagnostics.stackedProgressCount, 1);
  assert.equal(applied.nextAction.mode, "repair_bullet_depth");
  assert.equal(applied.nextAction.lineRewriteTargets[0].currentText, revisedText);
  assert.equal(value.store.latest()!.pageFillProgress, undefined);
});

test("one-line education and skills bullets are exempt from the depth gate", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  await value.apply.execute("write-before-depth-exemptions", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const workspace = structuredClone(value.store.latest()!);
  const sampleBullet = workspace.structure.sections.flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets[0]!;
  const education = workspace.structure.sections.find(
    (section) => section.type === "education",
  )!.items[0]!;
  const skills = workspace.structure.sections.find(
    (section) => section.type === "skills",
  )!.items[0]!;
  education.bullets = [{ ...sampleBullet, id: "education-one-line", text: "教育补充事实" }];
  skills.bullets = [{ ...sampleBullet, id: "skills-one-line", text: "技能汇总事实" }];
  const measured = withQualifiedLines(workspace, new Map());
  const template = measured.compileResult.bullets[0]!;
  measured.compileResult.bullets.push(
    { ...template, bulletId: "education-one-line", lineCount: 1 },
    { ...template, bulletId: "skills-one-line", lineCount: 1 },
  );

  const depthBlockers = resumeGenerationReadiness(measured).blockers.filter(
    (blocker) => blocker.code === "bullet_line_count_too_low",
  );
  assert.deepEqual(depthBlockers, []);
  assert.notEqual(resumeAgentNextAction(measured).mode, "repair_bullet_depth");
});

function underfilledWorkspace(
  workspace: NonNullable<ReturnType<ResumeWorkspaceStore["latest"]>>,
  usageRatio: number,
) {
  return {
    ...workspace,
    status: "writing" as const,
    compileResult: {
      ...workspace.compileResult,
      qualified: false,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: usageRatio * 1000,
      availableHeightPx: 1000,
      bodyLineHeightPx: 20,
      usageRatio,
      bullets: workspace.compileResult.bullets.map((bullet) => ({
        ...bullet,
        lineCount: 2,
        passed: true,
        lastLineRatio: 0.8,
      })),
      violations: [{ code: "page_underfilled" as const, message: "underfilled" }],
    },
  };
}

function withQualifiedLines(
  workspace: NonNullable<ReturnType<ResumeWorkspaceStore["latest"]>>,
  lineCounts: ReadonlyMap<string, number>,
) {
  return {
    ...workspace,
    status: "needs_revision" as const,
    compileObservedRevision: workspace.revision,
    compileResult: {
      ...workspace.compileResult,
      qualified: true,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 930,
      availableHeightPx: 1000,
      usageRatio: 0.93,
      violations: [],
      bullets: workspace.compileResult.bullets.map((bullet) => ({
        ...bullet,
        lineCount: lineCounts.get(bullet.bulletId) ?? 2,
        passed: true,
        lastLineRatio: 0.8,
      })),
    },
  };
}

test("education tier input is ignored without wasting a tool retry", async () => {
  const value = harness();
  const payload = text(
    await value.create.execute("education-tier", {
      jdId: "jd-1",
      language: "zh-CN",
      experiences: [
        { experienceId: "edu-1", tier: "secondary" },
        { experienceId: "work-1", tier: "main" },
      ],
    }),
  );

  assert.equal(payload.sourceSelection.mode, "created");
  assert.equal(payload.resume.items.find(
    (item: { itemId: string }) => item.itemId === "item-edu-1",
  ).tier, null);
});

test("explicit skills section does not require a relevance tier", async () => {
  const value = harness();
  const payload = text(await value.create.execute("skills-without-tier", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "edu-1" },
      { experienceId: "work-1", tier: "main" },
      { experienceId: "skills-1" },
    ],
  }));

  assert.equal(payload.operation, undefined);
  assert.equal(payload.resume.items.find(
    (item: { itemId: string }) => item.itemId === "item-skills-1",
  ).tier, null);
  assert.equal(payload.nextAction.mode, "repair_bullet_counts");
  assert.equal(payload.nextAction.itemTargets.find(
    (item: { itemId: string }) => item.itemId === "item-skills-1",
  ).minimumBulletCount, 1);
  assert.equal(payload.layout.items.find(
    (item: { itemId: string }) => item.itemId === "item-skills-1",
  ).minimumRequired, 1);
});

test("legacy utility rows require one grounded bullet before completion", async () => {
  const value = harness(new StablePageCompiler());
  const payload = text(await value.create.execute("utility-tier", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "edu-1" },
      { experienceId: "work-1", tier: "main" },
      { experienceId: "legacy-skills-1", tier: "utility" },
    ],
  }));

  assert.equal(payload.resume.items.find(
    (item: { itemId: string }) => item.itemId === "item-legacy-skills-1",
  ).tier, "utility");
  assert.equal(payload.layout.items.find(
    (item: { itemId: string }) => item.itemId === "item-legacy-skills-1",
  ).minimumRequired, 1);
  assert.equal(payload.nextAction.mode, "repair_bullet_counts");
  assert.equal(payload.nextAction.itemTargets.find(
    (item: { itemId: string }) => item.itemId === "item-legacy-skills-1",
  ).minimumBulletCount, 1);

  const mainOnly = await applyAgentResumeContent({
    workspace: value.store.latest()!,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
    compiler: value.compiler,
    store: value.store,
  });
  assert.equal(resumeGenerationReadiness(mainOnly.workspace).ready, false);
  assert.ok(resumeGenerationReadiness(mainOnly.workspace).blockers.some(
    (blocker) =>
      blocker.code === "bullet_count_too_low" &&
      blocker.itemId === "item-legacy-skills-1",
  ));
  assert.equal(resumeAgentNextAction(mainOnly.workspace).mode,
    "repair_bullet_counts");

  const emptyUtility = await applyAgentResumeContent({
    workspace: mainOnly.workspace,
    items: [{ itemId: "item-legacy-skills-1", bullets: [] }],
    compiler: value.compiler,
    store: value.store,
  });
  assert.equal(emptyUtility.operation.status, "rejected");
  assert.equal(emptyUtility.workspace.revision, mainOnly.workspace.revision);

  const utilityEvidence = evidenceForModel(mainOnly.workspace.sourceSnapshot)
    .find((entry) => entry.experienceId === "legacy-skills-1")!;
  const completed = text(await value.apply.execute("write-utility", {
    candidateId: payload.candidateId,
    expectedRevision: mainOnly.workspace.revision,
    items: [{
      itemId: "item-legacy-skills-1",
      bullets: [{
        text: utilityEvidence.text.replace(/[。.]$/u, ""),
        origin: "grounded",
        evidenceIds: [utilityEvidence.evidenceId],
      }],
    }],
  }));
  assert.equal(completed.readiness.ready, true);
});

test("missing semantic tier returns a recoverable receipt instead of a tool error", async () => {
  const value = harness();
  const payload = text(await value.create.execute("missing-tier", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "edu-1" },
      { experienceId: "work-1" },
    ],
  }));

  assert.equal(payload.status, "rejected");
  assert.match(payload.writeRejectedReason, /main、secondary 或 utility/u);
  assert.equal(value.store.latest(), undefined);
});

test("unknown tier strings return a recoverable receipt while education labels are ignored", async () => {
  const value = harness();
  const rejected = text(await value.create.execute("invalid-tier", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "edu-1", tier: "education" },
      { experienceId: "work-1", tier: "primary" },
    ],
  }));
  assert.equal(rejected.status, "rejected");
  assert.match(rejected.writeRejectedReason, /main、secondary 或 utility/u);

  const created = text(await value.create.execute("education-label", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "edu-1", tier: "education" },
      { experienceId: "work-1", tier: "main" },
    ],
  }));
  assert.equal(created.sourceSelection.mode, "created");
  assert.equal(created.resume.items.find(
    (item: { itemId: string }) => item.itemId === "item-edu-1",
  ).tier, null);
});

test("apply_resume_content keeps item validation atomic but allows partial success", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  const payload = text(
    await value.apply.execute("apply", {
      candidateId: created.candidateId,
      expectedRevision: 0,
      items: [
        { itemId: "item-work-1", bullets: workBullets(value) },
        {
          itemId: "item-edu-1",
          bullets: [
            {
              text: "主修信息系统与数据分析。",
              origin: "grounded",
              evidenceIds: ["edu-1:0:12"],
            },
          ],
        },
      ],
    }),
  );

  assert.equal(payload.operation.status, "partial_success");
  assert.deepEqual(payload.operation.appliedItemIds, ["item-work-1"]);
  assert.equal(payload.operation.rejectedItems[0].itemId, "item-edu-1");
  assert.equal(value.compiler.structures.length, 2, "one compile for the batch");
  assert.equal(value.store.latest()!.structure.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "item-edu-1")!.bullets.length, 0);
});

test("get_resume_workspace returns current authority without recompiling", async () => {
  const value = harness();
  await createWorkspace(value);
  const before = value.compiler.structures.length;
  const execution = await value.get.execute("get", {});
  const payload = text(execution);

  assert.equal(payload.revision, 0);
  assert.equal(value.compiler.structures.length, before);
  assert.ok(payload.availableEvidence.length >= 4);
  assert.equal(
    (execution.details as { loopGuardKey?: string }).loopGuardKey,
    resumeContentProgressKey(value.store.latest()!),
  );
});

test("create and get share one semantic no-progress key", async () => {
  const value = harness();
  await createWorkspace(value);
  const createResult = await value.create.execute("create-again", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "edu-1" },
      { experienceId: "work-1", tier: "main" },
    ],
  });
  const getResult = await value.get.execute("get-after-create", {});

  assert.equal(
    (createResult.details as { loopGuardKey?: string }).loopGuardKey,
    (getResult.details as { loopGuardKey?: string }).loopGuardKey,
  );
});

test("add_resume_material appends user facts without mutating the source snapshot", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  const sourceBefore = value.store.latest()!.sourceSnapshot.experiences
    .find((item) => item.id === "work-1")!.content;
  const add = createAddResumeMaterialTool(value.store, () => 1_234_567);
  const payload = text(
    await add.execute("material", {
      candidateId: created.candidateId,
      expectedRevision: 0,
      experienceId: "work-1",
      facts: ["独立搭建自动化检查流程并覆盖 5 个数据源"],
    }),
  );

  assert.equal(payload.revision, 1);
  assert.equal(payload.layout.observedRevision, 0);
  assert.equal(payload.addedEvidence.length, 1);
  assert.match(payload.addedEvidence[0].evidenceId, /^supplemental:/u);
  assert.equal(value.store.latest()!.sourceSnapshot.experiences
    .find((item) => item.id === "work-1")!.content, sourceBefore);
  assert.equal(value.compiler.structures.length, 1, "adding evidence does not compile");
});
