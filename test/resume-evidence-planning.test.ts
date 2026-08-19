import assert from "node:assert/strict";
import test from "node:test";

import { RESUME_GLOBAL_MINIMUM_USAGE_RATIO } from "../src/resume/compiler-types.js";
import { buildLayoutContext } from "../src/resume/planning/layout-context.js";
import { MINIMUM_USAGE_RATIO } from "../src/resume/planning/planner.js";
import {
  allEvidenceCandidates,
  rankAvailableEvidence,
} from "../src/resume/quality/evidence-candidates.js";
import { projectResumeSourceSnapshot } from "../src/resume/source-projection.js";
import { workspaceEvidenceRecords } from "../src/resume/workspace/agent-workspace-evidence.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { createWorkspaceSnapshotBuilder } from "./support/resume-workspace-fixture.js";

test("English sentence evidence splits at periods but preserves decimals", async () => {
  const snapshot = await snapshotWithContent(
    "Built a market model. Projected GPA 3.89/4.0. Delivered 10+ reports.",
  );
  const candidates = allEvidenceCandidates(snapshot).filter(
    ({ experienceId }) => experienceId === "work-1",
  );

  assert.deepEqual(
    candidates
      .toSorted((left, right) => left.sourceStart - right.sourceStart)
      .map(({ sourceQuote }) => sourceQuote),
    [
      "Built a market model.",
      "Projected GPA 3.89/4.0.",
      "Delivered 10+ reports.",
    ],
  );
});

test("oversized source sentences split into non-overlapping evidence clauses", async () => {
  const snapshot = await snapshotWithContent(
    "Analyzed institutional demand across regulated OTC trading and custody accounts, " +
      "mapped revenue drivers for several client segments and compliance workflows, " +
      "compared competitive positioning across regional platforms and operating models, " +
      "and delivered recommendations for product planning and stakeholder communication.",
  );
  const candidates = allEvidenceCandidates(snapshot)
    .filter(({ experienceId }) => experienceId === "work-1")
    .toSorted((left, right) => left.sourceStart - right.sourceStart);

  assert.ok(candidates.length >= 2);
  assert.ok(candidates.every(({ sourceQuote }) => sourceQuote.length <= 180));
  assert.ok(candidates.every(({ sourceQuote }) => sourceQuote.length >= 60));
  const recordIds = new Set(workspaceEvidenceRecords(snapshot).map(
    ({ evidenceId }) => evidenceId,
  ));
  assert.ok(candidates.every(({ evidenceId }) => recordIds.has(evidenceId)));
  for (let index = 1; index < candidates.length; index += 1) {
    assert.ok(candidates[index - 1]!.sourceEnd <= candidates[index]!.sourceStart);
  }
});

test("too-short evidence does not inflate model-facing writable capacity", async () => {
  const snapshot = await snapshotWithContent(
    "GPA: 3.89/4.0\nStudied economics, econometrics, corporate finance, statistics, and Python.",
  );
  const all = allEvidenceCandidates(snapshot).filter(
    ({ experienceId }) => experienceId === "work-1",
  );
  const writable = rankAvailableEvidence(snapshot, []).filter(
    ({ experienceId }) => experienceId === "work-1",
  );

  assert.equal(all.length, 2);
  assert.equal(writable.length, 1);
  assert.match(writable[0]?.sourceQuote ?? "", /^Studied economics/);
});

test("layout ceiling respects candidate count, line cap, and the 92% gate", async () => {
  const snapshot = await snapshotWithContent("One long evidence paragraph without a boundary");
  const context = buildLayoutContext(
    snapshot,
    ["work-1"],
    { availableHeightPx: 1_000, lineHeightPx: 20, fixedLines: 10, charsPerLine: 50 },
    "zh-CN",
    3,
  );

  assert.equal(MINIMUM_USAGE_RATIO, RESUME_GLOBAL_MINIMUM_USAGE_RATIO);
  assert.equal(context.requiredBulletLinesAtMinimum, 36);
  assert.equal(context.fixedLinesAlreadyExcluded, true);
  assert.equal(context.minimumDistinctBulletsAtMaxLines, 12);
  assert.equal(context.experiences[0]?.availableEvidenceCount, 1);
  assert.equal(context.experiences[0]?.maxWritableBulletLines, 3);
  // 物理上限按"每条可写证据至多支撑一条 ≤maxBulletLines 行的 bullet"估算：
  // (10 固定行 + 1×3 bullet 行) × 20px / 1000px = 0.26
  assert.equal(context.estimatedMaxUsageRatio, 0.26);
  assert.equal(context.insufficient, true);
});

test("source projection exposes evidence capacity without a fixed bullet plan", async () => {
  const snapshot = await snapshotWithContent("One indivisible source fact");
  const projection = projectResumeSourceSnapshot(snapshot) as {
    experiences: Array<{
      id: string;
      availableEvidenceCount: number;
      plannedBullets?: number;
    }>;
  };

  assert.equal(
    projection.experiences.find(({ id }) => id === "work-1")
      ?.availableEvidenceCount,
    1,
  );
  assert.equal(
    projection.experiences.find(({ id }) => id === "work-1")?.plannedBullets,
    undefined,
  );
});

async function snapshotWithContent(content: string) {
  const base = await createWorkspaceSnapshotBuilder().build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  return {
    ...base,
    experiences: base.experiences.map((experience) =>
      experience.id === "work-1" ? { ...experience, content } : experience,
    ),
  };
}
