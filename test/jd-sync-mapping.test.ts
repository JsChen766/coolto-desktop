import assert from "node:assert/strict";
import test from "node:test";

import type { JdCreateInput, JdRecord } from "../src/api/types.js";
import type { LocalEntity } from "../src/desktop/main/sync/local-sync-types.js";
import {
  assignRequirements,
  buildLocalJd,
  filterJds,
  toJdRecord,
  toJdWritePayload,
} from "../src/desktop/main/jd-library/jd-sync-mapping.js";

const baseInput: JdCreateInput = {
  title: "Backend Engineer",
  rawText: "We need a strong Go engineer.",
  company: "Coolto",
  targetRole: "Backend",
  sourceKind: "browser",
  sourceUrl: "https://jobs.example/backend",
  requirements: [
    {
      text: "5+ years Go",
      category: "skill",
      importance: "high",
      keywords: ["go"],
      v2Importance: "must_have",
      v2Category: "technology",
    },
    {
      text: "Nice to have Kubernetes",
      category: "skill",
      importance: "low",
      keywords: ["k8s"],
    },
  ],
};

function entity(
  payload: Record<string, unknown>,
  overrides: Partial<LocalEntity> = {},
): LocalEntity {
  return {
    entityType: "job_description",
    entityId: String(payload.id),
    entityVersion: 1,
    localVersion: 1,
    syncStatus: "pending",
    operation: "upsert",
    changedAt: "2026-07-27T00:00:00Z",
    payload,
    ...overrides,
  };
}

test("toJdWritePayload matches backend writePayload keys and canonical enums", () => {
  const requirements = assignRequirements(baseInput.requirements);
  const payload = toJdWritePayload(baseInput, requirements);
  assert.deepEqual(Object.keys(payload).sort(), [
    "company",
    "rawText",
    "requirements",
    "requirementsOrigin",
    "sourceKind",
    "sourceUrl",
    "status",
    "targetRole",
    "title",
  ].sort());
  const reqs = payload.requirements as Array<Record<string, unknown>>;
  assert.equal(payload.sourceKind, "browser");
  assert.equal(payload.sourceUrl, "https://jobs.example/backend");
  assert.equal(reqs[0]!.importance, "must_have");
  assert.equal(reqs[0]!.category, "technology");
  assert.equal(reqs[1]!.importance, "optional");
  assert.deepEqual(Object.keys(reqs[0]!).sort(), [
    "category",
    "id",
    "importance",
    "keywords",
    "text",
    "weight",
  ].sort());
});

test("assignRequirements produces stable unique ids and sort order", () => {
  const requirements = assignRequirements(baseInput.requirements);
  assert.equal(requirements.length, 2);
  assert.equal(requirements[0]!.sortOrder, 0);
  assert.equal(requirements[1]!.sortOrder, 1);
  assert.notEqual(requirements[0]!.id, requirements[1]!.id);
  assert.match(requirements[0]!.id, /^[0-9a-f-]{36}$/);
});

test("legacy requirement categories always map to backend canonical values", () => {
  const requirements = assignRequirements([
    { text: "Go", category: "skill", importance: "high", keywords: [] },
    { text: "5 years", category: "experience", importance: "high", keywords: [] },
    { text: "Unknown", category: "custom", importance: "low", keywords: [] },
  ]);
  assert.deepEqual(
    requirements.map((requirement) => requirement.category),
    ["technology", "qualification", "other"],
  );
});

test("round-trip local payload maps canonical importance back to legacy", () => {
  const requirements = assignRequirements(baseInput.requirements);
  const local = buildLocalJd("jd-1", baseInput, requirements, "2026-07-27T00:00:00Z");
  const record = toJdRecord(entity(local));
  assert.equal(record.id, "jd-1");
  assert.equal(record.sourceKind, "browser");
  assert.equal(record.sourceUrl, "https://jobs.example/backend");
  assert.equal(record.requirements.length, 2);
  const [req0, req1] = record.requirements;
  assert.equal(req0!.importance, "high");
  assert.equal(req0!.v2Importance, "must_have");
  assert.equal(req0!.v2Category, "technology");
  assert.equal(req1!.importance, "low");
  assert.equal(req0!.id, requirements[0]!.id);
  assert.ok(record.jdHash);
});

test("toJdRecord marks tombstone deletedAt for delete op", () => {
  const requirements = assignRequirements(baseInput.requirements);
  const local = buildLocalJd("jd-1", baseInput, requirements, "2026-07-27T00:00:00Z");
  const record = toJdRecord(
    entity(local, { operation: "delete", changedAt: "2026-07-28T00:00:00Z" }),
  );
  assert.equal(record.deletedAt, "2026-07-28T00:00:00Z");
});

function jdFixture(id: string, updatedAt: string): JdRecord {
  return {
    id,
    title: `jd-${id}`,
    company: null,
    targetRole: null,
    sourceKind: "manual",
    sourceUrl: null,
    rawText: "raw",
    requirements: [],
    jdHash: "hash",
    requirementMapId: null,
    requirementsOrigin: "app_extracted",
    sourceThreadId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt,
    entityVersion: 1,
    deletedAt: null,
  };
}

test("filterJds sorts by updatedAt desc and paginates by cursor", () => {
  const all = [
    jdFixture("a", "2026-07-01T00:00:00Z"),
    jdFixture("b", "2026-07-03T00:00:00Z"),
    jdFixture("c", "2026-07-02T00:00:00Z"),
  ];
  const first = filterJds(all, { limit: 2 });
  assert.deepEqual(first.items.map((j) => j.id), ["b", "c"]);
  assert.ok(first.nextCursor);
  const second = filterJds(all, { limit: 2, cursor: first.nextCursor! });
  assert.deepEqual(second.items.map((j) => j.id), ["a"]);
  assert.equal(second.nextCursor, null);
});
