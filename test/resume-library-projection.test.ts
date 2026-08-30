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
    targetCompany: null,
    jdId: null,
    contentHash: "hash-a",
    schemaVersion: "v1",
    qualityStatus: "passed",
    status: "active",
    entityVersion: 1,
    deletedAt: null,
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

test("a local general draft remains identifiable before cloud save", () => {
  const draft = makeDraft({
    workspace: {
      revision: 5,
      status: "ready_for_approval",
      sourceSnapshot: { generationStrategy: "general" },
    } as never,
  });
  const entry = buildEntryFromFull(null, draft);

  assert.equal(entry.local?.generationStrategy, "general");
  assert.equal(entry.local?.generationReady, true);
  assert.equal(entry.local?.jdId, null);
});

test("a local tailored draft retains its source JD before cloud save", () => {
  const draft = makeDraft({
    workspace: {
      revision: 5,
      status: "ready_for_approval",
      sourceSnapshot: {
        generationStrategy: "tailored",
        jd: { id: "jd-1", title: "平台工程师", targetRole: "平台工程师" },
      },
    } as never,
  });
  const entry = buildEntryFromFull(null, draft);

  assert.equal(entry.local?.jdId, "jd-1");
  assert.equal(entry.local?.jdTitle, "平台工程师");
  assert.equal(entry.local?.targetRole, "平台工程师");
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
