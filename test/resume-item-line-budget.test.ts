import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import type { ResumeStructure } from "../src/resume/types.js";
import {
  createItemLineBudgets,
  observedWorkspaceItemLines,
} from "../src/resume/workspace/item-line-budget.js";
import { evidenceForModel } from
  "../src/resume/workspace/agent-workspace-evidence.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from
  "../src/tools/agent-orchestrated/apply-content.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

test("item line budgets express relevance without prescribing bullet count", () => {
  const structure = fixtureStructure();
  const budgets = createItemLineBudgets({
    structure,
    itemTiers: {
      "item-main": "main",
      "item-secondary": "secondary",
    },
    compileResult: compile([]),
  });

  assert.ok(budgets["item-main"]!.targetLines >
    budgets["item-secondary"]!.targetLines);
  assert.equal(budgets["item-main"]!.tier, "main");
  assert.equal(budgets["item-secondary"]!.tier, "secondary");
  assert.equal(
    Object.values(budgets).reduce((sum, budget) => sum + budget.targetLines, 0),
    12,
  );
});

test("one evidence-rich report may occupy many measured lines in one bullet", () => {
  const structure = fixtureStructure();
  structure.sections[0]!.items[0]!.bullets = [{
    id: "report-bullet",
    text: "一篇完整研究报告",
    matched_jd_requirement_ids: [],
    source_fact_ids: ["e1", "e2", "e3", "e4"],
  }];
  const observed = observedWorkspaceItemLines({
    structure,
    compileResult: compile([{
      bulletId: "report-bullet",
      lineCount: 6,
    }]),
  });

  assert.equal(structure.sections[0]!.items[0]!.bullets.length, 1);
  assert.equal(observed["item-main"], 6);
});

test("one long multi-evidence report satisfies a main item without three bullets", async () => {
  const compiler = new LongReportCompiler();
  const store = new ResumeWorkspaceStore();
  const created = result(await createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), compiler, store,
  ).execute("create-long-report", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  const evidence = evidenceForModel(store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  const applyTool = createApplyResumeContentTool(compiler, store);
  const grouped = result(await applyTool.execute("group-one-report-unit", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    workUnits: [{
      itemId: "item-work-1",
      units: [{
        label: "数据产品周报与异常检查",
        kind: "report",
        evidenceIds: evidence.map((entry) => entry.evidenceId),
      }],
    }],
  }));
  const workUnitId = grouped.nextAction.itemTargets[0].availableWorkUnits[0]
    .workUnitId;
  const applied = result(await applyTool.execute("write-one-report-unit", {
    candidateId: created.candidateId,
    expectedRevision: grouped.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [{
        text: evidence.map((entry) => entry.text.replace(/。$/u, "")).join("，"),
        plannedLines: grouped.nextAction.itemTargets[0].targetLines,
        origin: "grounded",
        evidenceIds: evidence.map((entry) => entry.evidenceId),
        workUnitIds: [workUnitId],
        requirementIds: ["req-1"],
      }],
    }],
  }));

  const item = store.latest()!.structure.sections.flatMap(
    (section) => section.items,
  ).find((entry) => entry.id === "item-work-1")!;
  assert.equal(item.bullets.length, 1);
  assert.equal(store.latest()!.bulletProvenance?.[0]?.evidenceIds.length,
    evidence.length);
  assert.equal(applied.readiness.ready, true);
  assert.equal(applied.nextAction.mode, "stop");
  assert.ok(applied.readiness.blockers.every(
    (blocker: { code: string }) => blocker.code !== "bullet_count_too_low",
  ));
});

class LongReportCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const base = await super.compile(structure);
    const bulletCount = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets)
    ).length;
    if (!bulletCount) return base;
    return {
      ...base,
      qualified: true,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 950,
      availableHeightPx: 1000,
      usageRatio: 0.95,
      bullets: base.bullets.map((bullet) => ({
        ...bullet,
        lineCount: 12,
        lastLineWidthPx: 480,
        lastLineRatio: 0.8,
        passed: true,
      })),
      violations: [],
    };
  }
}

function result(value: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(value.content[0]?.text ?? "{}"));
}

function fixtureStructure(): ResumeStructure {
  return {
    language: "zh-CN",
    contact: { name: "A", phone: "1", email: "a@example.com", location: null },
    sections: [{
      id: "experience",
      type: "experience",
      heading: "经历",
      items: [
        item("item-main", "exp-main"),
        item("item-secondary", "exp-secondary"),
      ],
    }],
  };
}

function item(id: string, experienceId: string) {
  return {
    id,
    source_experience_id: experienceId,
    title: id,
    organization: "Org",
    role: null,
    location: null,
    start_date: "2024-01",
    end_date: "2024-06",
    raw_text: null,
    bullets: [],
  };
}

function compile(
  bullets: Array<{ bulletId: string; lineCount: number }>,
): ResumeCompileResult {
  return {
    templateId: "resume-standard",
    profileVersion: "v1",
    profileHash: "hash",
    pageCount: 1,
    usedHeightPx: 40,
    availableHeightPx: 160,
    usageRatio: 0.25,
    overflowPx: 0,
    bodyFontSizePx: 10,
    bodyLineHeightPx: 10,
    qualified: false,
    fontsReady: true,
    loadedFontFamilies: ["SimSun"],
    observedAt: "2026-08-29T00:00:00.000Z",
    viewport: { widthPx: 794, heightPx: 1123, devicePixelRatio: 1 },
    effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 1 },
    violations: [],
    bullets: bullets.map((bullet) => ({
      ...bullet,
      lastLineWidthPx: 80,
      availableLineWidthPx: 100,
      lastLineRatio: 0.8,
      passed: true,
    })),
  };
}
