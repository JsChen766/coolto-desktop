import assert from "node:assert/strict";
import test from "node:test";

import { buildEntryFromFull } from "../src/resume/library/projection.js";
import type { ResumeFull } from "../src/resume/types.js";
import type { LocalResumeDraft } from "../src/resume/draft/types.js";

function makeCloud(overrides: Partial<ResumeFull> = {}): ResumeFull {
  return {
    id: "r-1",
    title: "前端简历",
    targetRole: "前端工程师",
    jdId: null,
    contentHash: "hash-a",
    schemaVersion: "v1",
    qualityStatus: "passed",
    status: "active",
    createdAt: "2026-07-25T00:00:00Z",
    updatedAt: "2026-07-25T00:00:00Z",
    structured: {} as never,
    content: "",
    score: {} as never,
    evidenceSummary: [],
    riskSummary: [],
    missingInfo: [],
    qualityIssues: [],
    qualityGateVersion: null,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<LocalResumeDraft> = {}): LocalResumeDraft {
  return {
    schemaVersion: "local-resume-draft-v1",
    artifactId: "d-1",
    ownerId: "u-1",
    conversationIds: ["c-1"],
    title: "前端简历",
    createdAt: "2026-07-25T00:00:00Z",
    updatedAt: "2026-07-25T00:00:00Z",
    workspace: { revision: 5 } as never,
    checkpoints: [],
    pendingChange: null,
    cloudLink: null,
    ...overrides,
  };
}

test("cloud only — no draft", () => {
  const entry = buildEntryFromFull(makeCloud(), null);
  assert.equal(entry.syncStatus, "cloud_only");
  assert.ok(entry.cloud !== null);
  assert.equal(entry.local, null);
  assert.ok(entry.availableOperations.includes("open"));
});

test("local only — no cloud", () => {
  const entry = buildEntryFromFull(null, makeDraft());
  assert.equal(entry.syncStatus, "local_only");
  assert.equal(entry.cloud, null);
  assert.ok(entry.local !== null);
  assert.ok(entry.availableOperations.includes("delete_local_draft"));
});

test("synced — hashes and revisions match", () => {
  const entry = buildEntryFromFull(
    makeCloud({ contentHash: "h1" }),
    makeDraft({ cloudLink: { resumeId: "r-1", contentHash: "h1", syncedAt: "", syncedRevision: 5 }, workspace: { revision: 5 } as never }),
  );
  assert.equal(entry.syncStatus, "synced");
});

test("local_changes — local revision advanced", () => {
  const entry = buildEntryFromFull(
    makeCloud({ contentHash: "h1" }),
    makeDraft({ cloudLink: { resumeId: "r-1", contentHash: "h1", syncedAt: "", syncedRevision: 5 }, workspace: { revision: 9 } as never }),
  );
  assert.equal(entry.syncStatus, "local_changes");
});

test("conflict — both changed", () => {
  const entry = buildEntryFromFull(
    makeCloud({ contentHash: "h2" }),
    makeDraft({ cloudLink: { resumeId: "r-1", contentHash: "h1", syncedAt: "", syncedRevision: 5 }, workspace: { revision: 9 } as never }),
  );
  assert.equal(entry.syncStatus, "conflict");
  assert.ok(entry.availableOperations.includes("reload_cloud"));
  assert.ok(entry.availableOperations.includes("save_as_new"));
  assert.ok(entry.availableOperations.includes("overwrite_cloud"));
});

test("archived cloud — archive op replaced with unarchive", () => {
  const entry = buildEntryFromFull(makeCloud({ status: "archived" }), null);
  assert.ok(entry.availableOperations.includes("unarchive"));
  assert.ok(!entry.availableOperations.includes("archive"));
});

test("entry displayTitle falls back to cloud title", () => {
  const entry = buildEntryFromFull(makeCloud({ title: "高级工程师" }), null);
  assert.equal(entry.displayTitle, "高级工程师");
});
