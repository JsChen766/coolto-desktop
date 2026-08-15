import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExperienceCreateInput,
  ExperienceDetail,
} from "../src/api/types.js";
import type { LocalEntity } from "../src/desktop/main/sync/local-sync-types.js";
import {
  buildLocalExperience,
  toExperienceDetail,
  toExperienceWritePayload,
} from "../src/desktop/main/experience-library/experience-sync-mapping.js";
import { filterExperiences } from "../src/desktop/main/experience-library/experience-search.js";

const baseInput: ExperienceCreateInput = {
  category: "work",
  title: "Staff Engineer",
  content: "Built the sync engine.",
  organization: "Coolto",
  role: "IC",
  location: "Remote",
  startDate: "2022-01",
  tags: ["go", "sync"],
};

function entity(
  payload: Record<string, unknown>,
  overrides: Partial<LocalEntity> = {},
): LocalEntity {
  return {
    entityType: "experience",
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

test("toExperienceWritePayload matches backend createPayload keys", () => {
  const payload = toExperienceWritePayload(baseInput, "rev-1");
  assert.deepEqual(Object.keys(payload).sort(), [
    "category",
    "content",
    "endDate",
    "location",
    "organization",
    "role",
    "revisionId",
    "source",
    "startDate",
    "status",
    "tags",
    "title",
  ].sort());
  assert.equal(payload.status, "active");
  assert.equal(payload.revisionId, "rev-1");
  assert.equal(payload.source, "manual");
  assert.equal(payload.startDate, "2022-01");
});

test("buildLocalExperience synthesizes current revision", () => {
  const local = buildLocalExperience("exp-1", "rev-1", baseInput, "2026-07-27T00:00:00Z");
  const detail = toExperienceDetail(entity(local));
  assert.equal(detail.id, "exp-1");
  assert.equal(detail.currentRevisionId, "rev-1");
  assert.equal(detail.currentRevision?.id, "rev-1");
  assert.equal(detail.currentRevision?.experienceId, "exp-1");
  assert.equal(detail.currentRevision?.content, baseInput.content);
  assert.equal(detail.currentRevision?.factBankStatus, "not_applicable");
  assert.equal(detail.revisions.length, 1);
  assert.equal(detail.entityVersion, 1);
  assert.equal(detail.deletedAt, null);
});

test("toExperienceDetail marks tombstone deletedAt for delete op", () => {
  const local = buildLocalExperience("exp-1", "rev-1", baseInput, "2026-07-27T00:00:00Z");
  const detail = toExperienceDetail(
    entity(local, { operation: "delete", changedAt: "2026-07-28T00:00:00Z" }),
  );
  assert.equal(detail.deletedAt, "2026-07-28T00:00:00Z");
});

function detailFixture(
  id: string,
  overrides: Partial<ExperienceDetail>,
): ExperienceDetail {
  return {
    id,
    category: "work",
    title: `title-${id}`,
    organization: null,
    role: null,
    location: null,
    startDate: null,
    endDate: null,
    tags: [],
    status: "active",
    currentRevisionId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    entityVersion: 1,
    deletedAt: null,
    revisions: [],
    ...overrides,
  };
}

test("filterExperiences applies category, query and tag filters", () => {
  const all = [
    detailFixture("a", { category: "work", title: "Backend", tags: ["go"] }),
    detailFixture("b", { category: "project", title: "Frontend", tags: ["ts"] }),
    detailFixture("c", { category: "work", title: "Data", organization: "Acme", tags: ["go", "ml"] }),
  ];
  assert.deepEqual(
    filterExperiences(all, { category: "work" }).items.map((e) => e.id).sort(),
    ["a", "c"],
  );
  assert.deepEqual(
    filterExperiences(all, { q: "acme" }).items.map((e) => e.id),
    ["c"],
  );
  assert.deepEqual(
    filterExperiences(all, { tags: ["ml"] }).items.map((e) => e.id),
    ["c"],
  );
});

test("filterExperiences normalizes full text, requires every tag and defaults active", () => {
  const all = [
    detailFixture("active", {
      location: "Ｈｏｎｇ　Ｋｏｎｇ",
      tags: ["Go", "Sync"],
      currentRevisionId: "rev-active",
      currentRevision: {
        id: "rev-active",
        experienceId: "active",
        content: "Built an offline queue",
        source: "manual",
        revisionHash: null,
        factBankStatus: "not_applicable",
        createdAt: "2026-07-01T00:00:00Z",
      },
    }),
    detailFixture("archived", {
      status: "archived",
      title: "Archived role",
      tags: ["Go", "Sync"],
    }),
  ];
  assert.deepEqual(
    filterExperiences(all, { q: "hong kong", tags: [" go ", "SYNC"] })
      .items.map((item) => item.id),
    ["active"],
  );
  assert.deepEqual(
    filterExperiences(all, { q: "offline queue" }).items.map((item) => item.id),
    ["active"],
  );
  assert.deepEqual(filterExperiences(all, { tags: ["Go", "missing"] }).items, []);
  assert.deepEqual(
    filterExperiences(all, { status: "archived" }).items.map((item) => item.id),
    ["archived"],
  );
});

test("filterExperiences sorts by updatedAt desc then paginates by cursor", () => {
  const all = [
    detailFixture("a", { updatedAt: "2026-07-01T00:00:00Z" }),
    detailFixture("b", { updatedAt: "2026-07-03T00:00:00Z" }),
    detailFixture("c", { updatedAt: "2026-07-02T00:00:00Z" }),
  ];
  const first = filterExperiences(all, { limit: 2 });
  assert.deepEqual(first.items.map((e) => e.id), ["b", "c"]);
  assert.ok(first.nextCursor);
  const second = filterExperiences(all, { limit: 2, cursor: first.nextCursor! });
  assert.deepEqual(second.items.map((e) => e.id), ["a"]);
  assert.equal(second.nextCursor, null);
});
