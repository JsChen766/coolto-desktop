import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeCompileResult } from
  "../src/resume/compiler-types.js";
import type { ResumeStructure } from "../src/resume/types.js";
import type { ResumeCompiler } from
  "../src/resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import { createWorkspaceSnapshotBuilder } from
  "./support/resume-workspace-fixture.js";

test("sparse blank layout proceeds through grounded item-line planning", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder({
      tinyWorkContent:
        "负责日常数据整理。维护周度报表并与业务核对异常。",
    }),
    new SparseBlankCompiler(),
    store,
  );

  const result = payload(await create.execute("sparse-layout", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  }));

  assert.equal(result.status, "writing");
  assert.equal(result.materialRequest, undefined);
  assert.equal(result.nextAction.mode, "group_work_units");
  assert.equal(
    store.latest()!.structure.sections.some((section) =>
      section.items.some((item) => item.bullets.length > 0)
    ),
    false,
  );
});

class SparseBlankCompiler implements ResumeCompiler {
  public async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets)
    );
    return {
      templateId: "resume-standard",
      profileVersion: "resume-standard/v1",
      profileHash: "sha256:sparse",
      qualified: false,
      fontsReady: true,
      loadedFontFamilies: ["SimSun"],
      observedAt: "2026-08-25T00:00:00.000Z",
      viewport: { widthPx: 1280, heightPx: 900, devicePixelRatio: 1 },
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 300,
      availableHeightPx: 1000,
      bodyLineHeightPx: 20,
      bodyFontSizePx: 13,
      usageRatio: 0.3,
      effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 1 },
      bullets: bullets.map((bullet) => ({
        bulletId: bullet.id,
        lineCount: 2,
        lastLineWidthPx: 480,
        availableLineWidthPx: 600,
        lastLineRatio: 0.8,
        passed: true,
      })),
      violations: [{ code: "page_underfilled", message: "Page is underfilled." }],
    };
  }
}

function payload(value: unknown): any {
  return (value as { details: unknown }).details;
}
