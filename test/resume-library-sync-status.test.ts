import assert from "node:assert/strict";
import test from "node:test";

import { computeSyncStatus } from "../src/resume/library/sync-status.js";

const link = (hash: string, rev: number) => ({
  resumeId: "r-1",
  contentHash: hash,
  syncedAt: "2026-07-25T00:00:00Z",
  syncedRevision: rev,
});

test("no cloud → cloud_only", () => {
  assert.equal(
    computeSyncStatus({ hasCloud: true, hasDraft: false, cloudLink: null, cloudContentHash: "h1", localRevision: null }),
    "cloud_only",
  );
});

test("no cloud, has draft → local_only", () => {
  assert.equal(
    computeSyncStatus({ hasCloud: false, hasDraft: true, cloudLink: null, cloudContentHash: null, localRevision: 3 }),
    "local_only",
  );
});

test("draft has no cloudLink → local_only", () => {
  assert.equal(
    computeSyncStatus({ hasCloud: true, hasDraft: true, cloudLink: null, cloudContentHash: "h1", localRevision: 3 }),
    "local_only",
  );
});

test("hashes match, revisions match → synced", () => {
  assert.equal(
    computeSyncStatus({ hasCloud: true, hasDraft: true, cloudLink: link("h1", 5), cloudContentHash: "h1", localRevision: 5 }),
    "synced",
  );
});

test("hashes match, local revision advanced → local_changes", () => {
  assert.equal(
    computeSyncStatus({ hasCloud: true, hasDraft: true, cloudLink: link("h1", 5), cloudContentHash: "h1", localRevision: 8 }),
    "local_changes",
  );
});

test("cloud hash changed, local revision matches synced rev → cloud_changes", () => {
  assert.equal(
    computeSyncStatus({ hasCloud: true, hasDraft: true, cloudLink: link("h1", 5), cloudContentHash: "h2", localRevision: 5 }),
    "cloud_changes",
  );
});

test("both changed → conflict", () => {
  assert.equal(
    computeSyncStatus({ hasCloud: true, hasDraft: true, cloudLink: link("h1", 5), cloudContentHash: "h2", localRevision: 8 }),
    "conflict",
  );
});
