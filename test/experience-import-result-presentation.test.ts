import assert from "node:assert/strict";
import test from "node:test";

import type { ExperienceImportResultArtifact } from "../src/import/result-artifact.js";
import { presentExperienceImportResult } from "../src/import/result-presentation.js";

test("import result labels distinguish single, multiple and partial success", () => {
  assert.equal(presentExperienceImportResult(artifact(1, 0)).buttonLabel,
    "查看已入库经历");
  assert.equal(presentExperienceImportResult(artifact(2, 0)).buttonLabel,
    "查看 2 条已入库经历");
  const partial = presentExperienceImportResult(artifact(1, 2));
  assert.equal(partial.title, "经历部分导入完成");
  assert.equal(partial.buttonLabel, "查看已入库的 1 条经历");
  assert.match(partial.summary, /2 条待重试/);
});

test("all-failed results have no navigation and duplicates remain secondary", () => {
  const failed = presentExperienceImportResult(artifact(0, 2, 3));
  assert.equal(failed.title, "经历暂未导入");
  assert.equal(failed.buttonLabel, undefined);
  assert.equal(
    failed.summary,
    "已入库 0 条 · 2 条待重试 · 3 条疑似重复已跳过",
  );
});

function artifact(
  savedCount: number,
  failedCount: number,
  skippedDuplicateCount = 0,
): ExperienceImportResultArtifact {
  return {
    proposalId: "import-test",
    sourceLabel: "test",
    saved: Array.from({ length: savedCount }, (_, index) => ({
      clientId: `candidate-${index}`,
      experienceId: `experience-${index}`,
      title: `Experience ${index}`,
    })),
    failedCount,
    skippedDuplicateCount,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  };
}
