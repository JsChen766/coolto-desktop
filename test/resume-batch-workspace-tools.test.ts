import assert from "node:assert/strict";
import test from "node:test";

import { evidenceForModel } from "../src/resume/workspace/agent-workspace-evidence.js";
import { applyAgentResumeContent } from "../src/resume/workspace/agent-content-applier.js";
import { resumeContentProgressKey } from "../src/resume/workspace/agent-progress-key.js";
import { resumeAgentNextAction } from "../src/resume/workspace/agent-next-action.js";
import { resumeWriteRejection } from "../src/resume/workspace/agent-write-rejection.js";
import { buildAgentWorkspaceView } from "../src/resume/workspace/agent-workspace-view.js";
import { buildResumeSkeleton } from "../src/resume/workspace/candidate-skeleton.js";
import { groundedAdditionTargets } from "../src/resume/workspace/grounded-addition-targets.js";
import { resumeGenerationReadiness } from "../src/resume/workspace/generation-readiness.js";
import { selectLineRewrites } from "../src/resume/workspace/line-rewrite-selector.js";
import { retainContentAcrossSourceExpansion } from "../src/resume/workspace/source-reselection.js";
import { tailRepairBatch } from
  "../src/resume/workspace/tail-repair-targets.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from "../src/tools/agent-orchestrated/apply-content.js";
import { createAddResumeMaterialTool } from "../src/tools/agent-orchestrated/add-material.js";
import { createConfirmNoResumeMaterialTool } from
  "../src/tools/agent-orchestrated/confirm-no-material.js";
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
    const reflowed = new Set(improvingIds.filter((bulletId) =>
      texts.get(bulletId)?.startsWith("系统性地")
    ));
    return {
      ...result,
      qualified: reflowed.size === improving.size,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 950,
      availableHeightPx: 1000,
      usageRatio: 0.95,
      bullets: result.bullets.map((bullet) => improving.has(bullet.bulletId)
        ? reflowed.has(bullet.bulletId)
          ? { ...bullet, passed: true, lastLineWidthPx: 480, lastLineRatio: 0.8 }
          : { ...bullet, passed: false, lastLineWidthPx: 360, lastLineRatio: 0.6 }
        : bullet),
      violations: [
        ...result.violations.filter((violation) =>
          !violation.bulletId || !improving.has(violation.bulletId)
        ),
        ...improvingIds.filter((bulletId) => !reflowed.has(bulletId)).map((bulletId) => ({
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

class DepthFormalRejectionCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    const texts = new Map(structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, bullet.text] as const)
      )
    ));
    const rewritten = new Set(result.bullets.filter((bullet) =>
      texts.get(bullet.bulletId)?.endsWith("。")
    ).map((bullet) => bullet.bulletId));
    return {
      ...result,
      bullets: result.bullets.map((bullet) => rewritten.has(bullet.bulletId)
        ? { ...bullet, lineCount: 2, passed: true, lastLineRatio: 0.8 }
        : bullet),
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

class AdditionIdCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    const count = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets)
    ).length;
    const usageRatio = count >= 4 ? 0.96 : count >= 3 ? 0.94 : 0.8;
    return {
      ...result,
      qualified: count >= 4,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: usageRatio * 1000,
      availableHeightPx: 1000,
      usageRatio,
      bullets: result.bullets.map((bullet) => ({
        ...bullet,
        passed: true,
        lastLineWidthPx: 480,
        lastLineRatio: 0.8,
      })),
      violations: count >= 4
        ? []
        : [{ code: "page_underfilled" as const, message: "underfilled" }],
    };
  }
}

function text(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}

test("tail repair schema exposes at most two complete rewrites for four targets", () => {
  const schema = applyContentParameters.properties.tailRewrites as {
    maxItems?: number;
    items?: { properties?: Record<string, {
      maxItems?: number;
      items?: { properties?: Record<string, unknown> };
    }> };
  };
  assert.equal(schema.maxItems, 4);
  const candidates = schema.items?.properties?.candidates;
  assert.equal(candidates?.maxItems, 2);
  assert.ok(candidates?.items?.properties?.strategy);
  assert.ok(candidates?.items?.properties?.revisedText);
  assert.equal(applyContentParameters.properties.tailGrowths, undefined);
  const lineSchema = applyContentParameters.properties.lineExpansions as {
    items?: { properties?: Record<string, unknown> };
  };
  assert.ok(lineSchema.items?.properties?.insertText);
  assert.ok(lineSchema.items?.properties?.component);
  assert.ok(lineSchema.items?.properties?.placement);
  const removals = applyContentParameters.properties.bulletRemovals as {
    maxItems?: number;
  };
  assert.equal(removals.maxItems, 1);
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

test("bullet addition allocates after the highest suffix when existing ids have a gap", async () => {
  const builder = createWorkspaceSnapshotBuilder({
    workContent: `${WORK_CONTENT}补充访谈 8 名业务用户并整理需求优先级。`,
  });
  const compiler = new AdditionIdCompiler();
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(builder, compiler, store);
  const apply = createApplyResumeContentTool(compiler, store);
  const created = text(await create.execute("create-id-gap", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  const evidence = evidenceForModel(store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  const initial = text(await apply.execute("write-id-gap", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: evidence.slice(0, 3).map((entry, index) => ({
        bulletId: `item-work-1-bullet-${index + 2}`,
        text: entry.text.replace(/。$/u, ""),
        plannedLines: 2,
        origin: "grounded",
        evidenceIds: [entry.evidenceId],
        requirementIds: ["req-1"],
      })),
    }],
  }));
  assert.equal(initial.nextAction.mode, "increase_usage");
  assert.equal(initial.nextAction.requiredInput, "bulletAdditions");

  const added = text(await apply.execute("append-after-gap", {
    candidateId: created.candidateId,
    expectedRevision: initial.revision,
    bulletAdditions: [{
      itemId: "item-work-1",
      text: evidence[3]!.text.replace(/。$/u, ""),
      origin: "grounded",
      evidenceIds: [evidence[3]!.evidenceId],
      requirementIds: ["req-1"],
    }],
  }));

  assert.equal(added.revision, initial.revision + 1);
  assert.equal(added.operation.status, "success");
  assert.deepEqual(
    store.latest()!.structure.sections.flatMap((section) =>
      section.items.find((item) => item.id === "item-work-1")?.bullets ?? []
    ).map((bullet) => bullet.id),
    [
      "item-work-1-bullet-2",
      "item-work-1-bullet-3",
      "item-work-1-bullet-4",
      "item-work-1-bullet-5",
    ],
  );
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
    plannedLines: 3,
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
    plannedLines: 2,
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
  assert.equal(payload.wholePageBudget.linePlanning.minimumLinesPerBullet, 1);
  assert.equal(payload.wholePageBudget.linePlanning.fixedMaximumLinesPerBullet, null);
  assert.equal(payload.wholePageBudget.minimumBodyLinesForMinimumBullets, 3);
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

test("first generation writes every available fact before asking for more", async () => {
  const value = harness(new StablePageCompiler());
  const payload = text(await value.create.execute("insufficient-count-evidence", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  }));

  assert.equal(payload.status, "writing");
  assert.equal(payload.nextAction.mode, "repair_bullet_counts");
  assert.deepEqual(payload.nextAction.itemIds, [
    "item-tiny-work-1",
    "item-work-1",
  ]);
  assert.equal(payload.nextAction.itemTargets[0].allowPartialDraft, true);

  const drafted = text(await value.apply.execute("write-grounded-body-first", {
    candidateId: payload.candidateId,
    expectedRevision: payload.revision,
    items: [
      { itemId: "item-tiny-work-1", bullets: tinyWorkBullets(value) },
      { itemId: "item-work-1", bullets: workBullets(value) },
    ],
  }));
  assert.equal(drafted.revision, payload.revision + 1);
  assert.equal(drafted.operation.status, "success");
  assert.equal(drafted.status, "needs_user_decision");
  assert.equal(drafted.nextAction.mode, "request_more_material");
  assert.equal(drafted.nextAction.targetExperienceId, "tiny-work-1");
  assert.match(drafted.nextAction.question, /只有 1 条可独占事实/u);
  assert.match(drafted.nextAction.question, /至少需要 2 条 bullet/u);
  assert.equal(
    value.store.latest()!.structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets)
    ).length,
    4,
  );

  const finalized = text(await createConfirmNoResumeMaterialTool(
    value.store,
    () => 100,
    value.compiler,
  ).execute("skip-insufficient-item", {
    candidateId: drafted.candidateId,
    expectedRevision: drafted.revision,
  }));
  assert.equal(finalized.status, "ready_for_approval");
  assert.equal(finalized.readiness.ready, true);
  assert.equal(finalized.nextAction.mode, "stop");
  assert.equal(value.store.latest()!.structure.sections.some((section) =>
    section.items.some((item) => item.id === "item-tiny-work-1")
  ), false);
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

test("count repair rejects a duplicate range but keeps other valid bullets", async () => {
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

  assert.equal(result.operation.status, "partial_success");
  assert.match(result.operation.rejectedItems[0].reason, /reuses.*reserved/u);
  assert.equal(value.store.latest()!.revision, workspace.revision + 1);
  assert.equal(value.store.latest()!.bindings.length, 2);
  assert.equal(result.nextAction.mode, "repair_bullet_counts");
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

test("first-generation count repair keeps individually valid bullets", async () => {
  const value = harness();
  const workspace = await createWorkspace(value);
  const bullets = workBullets(value);
  const result = text(await value.apply.execute("partial-count-repair", {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [
        bullets[0]!,
        bullets[1]!,
        {
          ...bullets[2]!,
          text: `${bullets[2]!.text}并虚构 999 个项目结果`,
        },
      ],
    }],
  }));

  assert.equal(result.operation.status, "partial_success");
  assert.equal(result.operation.appliedItemIds[0], "item-work-1");
  assert.equal(result.operation.rejectedItems[0].errors[0].code,
    "unsupported_numeric_claim");
  assert.equal(result.revision, workspace.revision + 1);
  const item = value.store.latest()!.structure.sections.flatMap(
    (section) => section.items,
  ).find((candidate) => candidate.id === "item-work-1")!;
  assert.equal(item.bullets.length, 2);
  assert.equal(result.nextAction.mode, "repair_bullet_counts");
});

test("item retry progress requires formal resume progress, not a changing error set", async () => {
  const value = harness();
  const workspace = await createWorkspace(value);
  const bullets = workBullets(value);
  const execute = (
    punctuation: boolean,
    unsupportedNumber: number,
    firstEvidenceMissing = false,
  ) =>
    value.apply.execute("item-retry-progress", {
      candidateId: workspace.candidateId,
      expectedRevision: workspace.revision,
      items: [{
        itemId: "item-work-1",
        bullets: [{
          ...bullets[0]!,
          text: `${bullets[0]!.text}${punctuation ? "。" : ""}`,
          ...(firstEvidenceMissing ? { evidenceIds: [] } : {}),
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
  const second = await execute(false, 999, true);
  const sameFailures = await execute(false, 998, true);
  const key = (result: typeof first) =>
    (result.details as { loopGuardKey: string }).loopGuardKey;

  assert.equal(
    key(first),
    key(second),
    "changing rejection codes without landing content is not product progress",
  );
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
  assert.equal(unchanged.recovery.repeated, true);
  assert.match(unchanged.recovery.instruction, /禁止再次调用 create_resume_workspace/u);
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
  const value = harness(new StablePageCompiler());
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
  value.store.restore(workspace);
  const compileCount = value.compiler.structures.length;
  assert.match(resumeWriteRejection(workspace, {
    tailRewrites: [{
      bulletId: failed[0]!,
      candidates: [{ strategy: "expand", revisedText: "补充具体方法" }],
    }],
  }) ?? "", /必须用一次 tailRewrites.*missing=/u);

  const rejected = text(await value.apply.execute("incomplete-tail-batch", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRewrites: [{
      bulletId: failed[0]!,
      candidates: [{ strategy: "expand", revisedText: "补充具体方法" }],
    }],
  }));

  assert.equal(value.compiler.structures.length, compileCount);
  assert.equal(rejected.revision, written.revision);
  assert.match(rejected.writeRejectedReason, /missing=/u);
  assert.equal(rejected.nextAction.mode, "batch_tail_rewrite");
  assert.deepEqual(
    new Set(rejected.nextAction.bulletIds),
    new Set(failed),
  );
  assert.ok(rejected.nextAction.tailRewriteTargets.every(
    (target: {
      requiredEdit: string;
      bulletId: string;
      currentText: string;
      rejectedCandidates: string[];
      sourceQuotes: string[];
    }) =>
      target.currentText.length > 0 &&
      target.sourceQuotes.length > 0 &&
      /完整/u.test(target.requiredEdit) &&
      /revisedText/u.test(target.requiredEdit) &&
      Array.isArray(target.rejectedCandidates),
  ));
  assert.ok(rejected.nextAction.tailRewriteTargets.every(
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

  assert.equal(value.compiler.structures.length, compileCount);
});

test("model-facing tail repair batches four targets without dropping the ledger", async () => {
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
  assert.equal(nextAction.mode, "batch_tail_rewrite");
  if (nextAction.mode !== "batch_tail_rewrite") return;
  assert.equal(nextAction.bulletIds.length, 4);
  assert.equal(nextAction.tailRewriteTargets.length, 4);
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
  const currentTextById = new Map(workspace.structure.sections.flatMap(
    (section) => section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, bullet.text] as const)
    ),
  ));
  const rejected = text(await value.apply.execute("zero-progress-tail", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRewrites: initialBatch.map((bulletId) => ({
      bulletId,
      candidates: [{ strategy: "expand",
        revisedText: `${currentTextById.get(bulletId)}补充数据口径校验过程一${bulletId}` }],
    })),
  }));

  assert.equal(rejected.revision, written.revision);
  assert.equal(rejected.nextAction.mode, "batch_tail_rewrite");
  assert.equal(rejected.nextAction.bulletIds.length, failed.length);
  assert.ok(rejected.nextAction.bulletIds.every(
    (bulletId: string) => failed.includes(bulletId),
  ));
  assert.equal(rejected.tailRepairFeedback.length, initialBatch.length);
  assert.ok(rejected.tailRepairFeedback.every(
    (target: { status: string }) => target.status === "rejected",
  ));
  assert.ok(rejected.nextAction.tailRewriteTargets.every((target: {
    currentText: string;
    requiredEdit: string;
  }) => target.currentText.length > 0 &&
    /完整/u.test(target.requiredEdit)));

  const second = text(await value.apply.execute("zero-progress-tail-recompose", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRewrites: initialBatch.map((bulletId) => ({
      bulletId,
      candidates: [{ strategy: "compact",
        revisedText: `${currentTextById.get(bulletId)}补充数据口径校验过程二${bulletId}` }],
    })),
  }));
  assert.equal(second.revision, written.revision);
  assert.equal(second.nextAction.mode, "request_more_material");
  assert.equal("tailRepairReminder" in second, false);
  assert.match(second.terminalInstruction, /立即停止所有工具调用/u);
  assert.equal(value.store.latest()!.materialRequest?.kind, "tail_repair_stalled");
});

test("a complete semantic tail rewrite is applied only after it passes", async () => {
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
  assert.equal(action.mode, "batch_tail_rewrite");
  if (action.mode !== "batch_tail_rewrite") return;
  const lengthTarget = action.tailRewriteTargets[0]!;
  assert.match(lengthTarget.requiredEdit, /完整/u);
  const revised = `系统性地${original}逐步改善`;

  const advancedExecution = await value.apply.execute("advance-tail-baseline", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    tailRewrites: [{
      bulletId: target.id,
      candidates: [{ strategy: "compact", revisedText: revised }],
    }],
  });
  const advanced = text(advancedExecution);

  assert.equal(advanced.revision, written.revision + 1);
  assert.equal(advanced.tailRepairDiagnostics.appliedTargetCount, 1);
  assert.equal(
    (advancedExecution.details as { turnGovernorPhaseKey?: string })
      .turnGovernorPhaseKey,
    "resume_tail_repair",
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
  assert.match(repair.growthHint, /来源/u);
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
  assert.equal(rejected.nextAction.requiredInput, "lineExpansions");
  assert.equal(rejected.nextAction.additionalBodyLinesToMinimum, 5);
  assert.ok(Array.isArray(rejected.nextAction.groundedAdditionTargets));
  assert.ok(rejected.nextAction.lineExpansionTargets.length <= 8);
  assert.ok(rejected.nextAction.lineExpansionTargets.every(
    (entry: {
      requiredEdit: string;
      currentText: string;
      currentLines: number;
      plannedLines: number;
      remainingPlannedLines: number;
      evidenceIds: string[];
      sourceQuotes: string[];
    }) =>
      entry.currentText.length > 0 && entry.evidenceIds.length > 0 &&
      entry.sourceQuotes.length > 0 && entry.currentLines > 0 &&
      entry.plannedLines >= entry.currentLines &&
      /锁定 currentText/u.test(entry.requiredEdit) && /insertText/u.test(entry.requiredEdit) &&
      !("currentCharacters" in entry) && !("characterDelta" in entry) &&
      !("targetCharacters" in entry),
  ));
  const fullView = buildAgentWorkspaceView(workspace) as {
    layout: { bullets: object[] };
  };
  assert.ok(fullView.layout.bullets.every(
    (entry: object) => !("characterTargets" in entry),
  ));
  assert.match(rejected.writeRejectedReason, /lineExpansions/u);

  const expanded = text(await value.apply.execute("underfill-line-expansions", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    lineExpansions: [
      {
        bulletId: validTarget.id,
        component: "method",
        placement: "append",
        insertText: "增加一行短尾",
      },
      {
        bulletId: fullerTarget.id,
        component: "action",
        placement: "append",
        insertText: "增加一行短尾，补充处理方法",
      },
    ],
  }));
  assert.equal(expanded.revision, written.revision + 1);
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

test("first-generation underfill consumes unused grounded facts before expansion", async () => {
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
  assert.equal(action.requiredInput, "bulletAdditions");
  assert.ok(action.groundedAdditionTargets.some(
    (target) => target.sourceQuote.includes("访谈 8 名业务用户"),
  ));
});

test("a user-supplied fact must be integrated before page-fill expansion", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  const written = text(await value.apply.execute("write-before-new-fact", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  }));
  value.store.restore(underfilledWorkspace(value.store.latest()!, 0.84));
  const add = createAddResumeMaterialTool(value.store, () => 55_555);
  const added = text(await add.execute("new-grounded-page-fact", {
    candidateId: created.candidateId,
    expectedRevision: written.revision,
    experienceId: "work-1",
    facts: ["组织 6 场用户访谈并形成产品需求优先级"],
  }));

  const action = resumeAgentNextAction(value.store.latest()!);
  assert.equal(action.mode, "integrate_supplemental_evidence");
  if (action.mode !== "integrate_supplemental_evidence") return;
  assert.equal(action.requiredInput, "items");
  assert.ok(action.itemTargets.some(
    (target) => target.supplementalEvidence.some(
      (entry) => entry.text.includes("6 场用户访谈"),
    ),
  ));
  const target = action.itemTargets[0]!;
  const supplemental = target.supplementalEvidence[0]!;
  const integrated = text(await value.apply.execute("integrate-numeric-fact", {
    candidateId: created.candidateId,
    expectedRevision: added.revision,
    items: [{
      itemId: target.itemId,
      bullets: target.currentBullets.map((bullet, index) => index === 0
        ? {
            ...bullet,
            text: `${bullet.text}，组织 6 场用户访谈并形成产品需求优先级`,
            evidenceIds: [...bullet.evidenceIds, supplemental.evidenceId],
          }
        : bullet),
    }],
  }));
  assert.equal(integrated.revision, added.revision + 1);
  assert.doesNotMatch(
    JSON.stringify(integrated.nextAction),
    /integrate_supplemental_evidence/u,
  );
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
  assert.equal(
    value.store.latest()!.pageFillProgress?.consecutiveZeroGrowthRounds,
    1,
  );
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
    requestId: second.nextAction.requestId,
    experienceId: "work-1",
    facts: ["补充完成 5 场需求评审并记录关键决策"],
  }));
  assert.equal(resumed.status, "writing");
  assert.equal("materialRequest" in resumed, false);
  assert.equal(value.store.latest()!.pageFillProgress, undefined);
  assert.equal(value.store.latest()!.lineRewriteProgress, undefined);
  assert.equal(resumed.nextAction.mode, "integrate_supplemental_evidence");
  assert.equal(resumed.nextAction.requiredInput, "items");
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

test("one-line bullets are valid when the formal layout passes", async () => {
  const value = harness();
  const created = await createWorkspace(value);
  await value.apply.execute("write-before-dynamic-line-check", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets: workBullets(value) }],
  });
  const workspace = value.store.latest()!;
  const measured = withQualifiedLines(workspace, new Map(
    workspace.compileResult.bullets.map((bullet) => [bullet.bulletId, 1]),
  ));
  assert.equal(resumeGenerationReadiness(measured).blockers.some(
    (blocker) => blocker.code.includes("line_count"),
  ), false);
  const reused = {
    ...measured,
    reuseBase: {
      kind: "local" as const,
      resumeId: "existing-resume",
      sourceJdId: "jd-old",
      contentHash: "hash-old",
      retainedBulletCount: measured.compileResult.bullets.length,
      droppedBulletCount: 0,
    },
  };
  assert.notEqual(resumeAgentNextAction(reused).mode, "increase_usage");
});

test("planned lines persist and real Chromium lines lock after page fit", async () => {
  const value = harness(new StablePageCompiler());
  const created = await createWorkspace(value);
  const bullets = workBullets(value).map((bullet, index) => ({
    ...bullet,
    plannedLines: index + 1,
  }));
  await value.apply.execute("write-with-line-plan", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{ itemId: "item-work-1", bullets }],
  });
  const workspace = value.store.latest()!;
  const ids = workspace.structure.sections.flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets.map((bullet) => bullet.id);
  assert.deepEqual(ids.map((id) => workspace.bulletLinePlans?.[id]?.plannedLines),
    [1, 2, 3]);
  assert.ok(ids.every((id) =>
    (workspace.bulletLinePlans?.[id]?.lockedLines ?? 0) >= 1
  ));
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

  const repeated = text(await value.get.execute("get-again", {}));
  assert.equal(repeated.recovery.repeated, true);
  assert.match(repeated.recovery.instruction, /禁止再次调用 get_resume_workspace/u);
  assert.equal("availableEvidence" in repeated, false);
  assert.deepEqual(repeated.nextAction, payload.nextAction);
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
  assert.equal(
    (createResult.details as { turnGovernorPhaseKey?: string })
      .turnGovernorPhaseKey,
    "resume_generation",
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
