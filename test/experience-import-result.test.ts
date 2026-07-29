import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeExperienceImportResult,
  parseExperienceImportResult,
} from "../src/import/result-artifact.js";

test("import result parsing rejects unrelated approval details", () => {
  assert.equal(parseExperienceImportResult({ jdId: "jd-1" }), undefined);
  assert.equal(parseExperienceImportResult({
    proposalId: "import-1",
    saved: [{ clientId: "candidate-1" }],
    failed: [],
    skippedDuplicateCount: 0,
    completedAt: "2026-07-29T00:00:00.000Z",
  }), undefined);
});

test("partial retries merge into one stable import artifact", () => {
  const first = parseExperienceImportResult(details({
    saved: [saved("candidate-1", "exp-1", "First")],
    failed: [{
      clientId: "candidate-2",
      title: "Second",
      message: "offline",
    }],
    skippedDuplicateCount: 1,
  }));
  assert.ok(first);
  const partial = mergeExperienceImportResult(undefined, first);
  assert.equal(partial.saved.length, 1);
  assert.equal(partial.failedCount, 1);

  const retry = parseExperienceImportResult(details({
    saved: [saved("candidate-2", "exp-2", "Second")],
    failed: [],
    completedAt: "2026-07-29T00:01:00.000Z",
  }));
  assert.ok(retry);
  const complete = mergeExperienceImportResult(partial, retry);
  assert.deepEqual(
    complete.saved.map((item) => item.experienceId),
    ["exp-1", "exp-2"],
  );
  assert.equal(complete.failedCount, 0);
  assert.equal(complete.skippedDuplicateCount, 1);
  assert.equal(complete.createdAt, partial.createdAt);
  assert.equal(complete.updatedAt, "2026-07-29T00:01:00.000Z");
});

function details(overrides: Record<string, unknown>) {
  return {
    proposalId: "import-proposal",
    sourceLabel: "resume.docx",
    saved: [],
    failed: [],
    skippedDuplicateCount: 0,
    completedAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

function saved(clientId: string, experienceId: string, title: string) {
  return { clientId, experienceId, title };
}
