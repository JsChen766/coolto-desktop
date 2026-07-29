import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalApplication,
  filterApplications,
  toApplicationCreatePayload,
  toApplicationTransitionPayload,
  toApplicationUpdatePayload,
} from "../src/desktop/main/application-library/application-sync-mapping.js";
import {
  toApplicationRecord,
  toApplicationTombstone,
} from "../src/desktop/main/application-library/application-sync-normalizer.js";
import type { LocalEntity } from "../src/desktop/main/sync/local-sync-types.js";
import {
  allowedApplicationTransitions,
  canTransitionApplication,
  isTerminalApplicationStatus,
} from "../src/tracker/application-status.js";
import type { ApplicationCreateInput } from "../src/tracker/types.js";

const now = "2026-07-28T08:00:00.000Z";
const createInput: ApplicationCreateInput = {
  jdId: "jd-1",
  resumeId: "resume-1",
  companyName: " Coolto ",
  roleName: " Engineer ",
  deliveryMethod: "manual",
  targetUrl: "https://example.com/jobs/1",
  appliedAt: now,
  source: "manual",
};
const hash = "a".repeat(64);
const snapshots = {
  jdTitle: "Backend JD",
  resumeTitle: "Backend Resume",
  resumeContentHash: hash,
};

test("Application create payload matches backend sync command keys", () => {
  assert.deepEqual(toApplicationCreatePayload(createInput, snapshots), {
    jdId: "jd-1",
    resumeId: "resume-1",
    companyName: "Coolto",
    roleName: "Engineer",
    jdTitleSnapshot: "Backend JD",
    resumeTitleSnapshot: "Backend Resume",
    resumeContentHashSnapshot: hash,
    deliveryMethod: "manual",
    targetUrl: "https://example.com/jobs/1",
    appliedAt: now,
    pendingConfirmation: false,
    source: "manual",
    dedupeKey: null,
    companyBusiness: null,
    roleSummary: null,
    companyCulture: null,
  });
});

test("local projection normalizes title snapshots and sync metadata", () => {
  const payload = buildLocalApplication("app-1", createInput, snapshots, now);
  const record = toApplicationRecord(entity(payload));
  assert.equal(record.status, "applied");
  assert.equal(record.jdTitleSnapshot, "Backend JD");
  assert.equal(record.resumeTitleSnapshot, "Backend Resume");
  assert.equal(record.syncStatus, "pending");
  assert.equal(record.entityVersion, 1);
});

test("Application normalizer fails closed on malformed backend enums", () => {
  const payload = buildLocalApplication("app-1", createInput, snapshots, now);
  assert.throws(
    () => toApplicationRecord(entity({ ...payload, status: "draft" })),
    /Malformed application.status/,
  );
});

test("legacy Application projection without Resume hash remains readable", () => {
  const payload = buildLocalApplication("app-1", createInput, snapshots, now);
  delete payload.resumeContentHashSnapshot;
  assert.equal(toApplicationRecord(entity(payload)).resumeContentHashSnapshot, null);
});

test("update and transition payloads exclude server-owned fields", () => {
  assert.deepEqual(Object.keys(toApplicationUpdatePayload({
    jdId: null,
    resumeId: null,
    companyName: "Coolto",
    roleName: "Engineer",
    deliveryMethod: "manual",
    targetUrl: null,
    appliedAt: now,
    pendingConfirmation: false,
    companyBusiness: null,
    roleSummary: null,
    companyCulture: null,
    rejectionReason: null,
  })), [
    "jdId", "resumeId", "resumeContentHashSnapshot",
    "companyName", "roleName", "deliveryMethod",
    "targetUrl", "appliedAt", "pendingConfirmation", "companyBusiness",
    "roleSummary", "companyCulture", "rejectionReason",
  ]);
  assert.deepEqual(toApplicationTransitionPayload({ toStatus: "screening" }), {
    toStatus: "screening",
    occurredAt: null,
    reason: null,
  });
});

test("status contract matches backend legal edges and terminal states", () => {
  assert.deepEqual(allowedApplicationTransitions("applied"), [
    "screening", "rejected", "no_response",
  ]);
  assert.equal(canTransitionApplication("screening", "interviewing"), true);
  assert.equal(canTransitionApplication("applied", "offer"), false);
  assert.equal(canTransitionApplication("interviewing", "interviewing"), true);
  assert.equal(isTerminalApplicationStatus("offer"), true);
});

test("board filtering is local, stable and cursor-paginated", () => {
  const first = toApplicationRecord(entity(
    buildLocalApplication("app-1", createInput, snapshots, now),
  ));
  const second = {
    ...first,
    id: "app-2",
    companyName: "Other",
    updatedAt: "2026-07-28T09:00:00.000Z",
  };
  const page = filterApplications([first, second], { limit: 1 });
  assert.deepEqual(page.items.map((item) => item.id), ["app-2"]);
  assert.ok(page.nextCursor);
  assert.deepEqual(
    filterApplications([first, second], { cursor: page.nextCursor ?? undefined }).items
      .map((item) => item.id),
    ["app-1"],
  );
});

test("delete projection exposes a tombstone without parsing an empty payload", () => {
  const tombstone = toApplicationTombstone(entity({}, "delete"));
  assert.deepEqual(tombstone, {
    id: "app-1",
    entityVersion: 1,
    deletedAt: now,
    syncStatus: "pending",
  });
});

function entity(
  payload: Record<string, unknown>,
  operation: LocalEntity["operation"] = "upsert",
): LocalEntity {
  return {
    entityType: "application",
    entityId: "app-1",
    entityVersion: 0,
    localVersion: 1,
    syncStatus: "pending",
    operation,
    changedAt: now,
    payload,
  };
}
