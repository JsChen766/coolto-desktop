import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExperienceRevision,
  ExperienceRevisionReader,
} from "../src/api/types.js";
import {
  ExperienceHistoryService,
  pendingRevision,
} from "../src/desktop/main/experience-library/experience-history-service.js";
import { buildLocalExperience } from "../src/desktop/main/experience-library/experience-sync-mapping.js";
import type { LocalSyncStore } from "../src/desktop/main/sync/local-sync-store.js";
import type { LocalEntity } from "../src/desktop/main/sync/local-sync-types.js";

test("history separates a changed pending body from online pages", async () => {
  const entity = pendingEntity("Local pending", "Server body");
  const remote = new FakeRemote([revision("server-rev", "Server body")]);
  const history = service(entity, remote);
  const page = await history.list({ experienceId: "exp-1" });

  assert.equal(page.pendingRevision?.content, "Local pending");
  assert.equal(page.unavailable, false);
  assert.deepEqual(page.items.map((item) => item.id), ["server-rev"]);
  assert.equal(history.loadedRevision("exp-1", "server-rev").content, "Server body");
});

test("metadata-only pending does not create a fake local revision", () => {
  const entity = pendingEntity("Same body", "Same body");
  entity.payload = { ...entity.payload, title: "Renamed locally" };
  assert.equal(pendingRevision(entity), null);
});

test("loaded current content cannot become a restore no-op", async () => {
  const payload = buildLocalExperience("exp-1", "current", input("Current"), NOW);
  const entity = localEntity(payload, {});
  const history = service(entity, new FakeRemote([revision("current", "Current")]));
  await history.list({ experienceId: "exp-1" });
  assert.throws(
    () => history.loadedRevision("exp-1", "current"),
    /已是当前内容/,
  );
});

test("unsynced create returns only the local revision without remote I/O", async () => {
  const payload = buildLocalExperience("exp-1", "local-rev", input("Draft"), NOW);
  const entity = localEntity(payload, { entityVersion: 0, syncStatus: "pending" });
  const remote = new FakeRemote([]);
  const page = await service(entity, remote).list({ experienceId: "exp-1" });
  assert.equal(page.pendingRevision?.id, "local-rev");
  assert.equal(page.items.length, 0);
  assert.equal(remote.calls, 0);
});

test("offline history still returns the local pending body", async () => {
  const entity = pendingEntity("Local pending", "Server body");
  const remote: ExperienceRevisionReader = {
    async listExperienceRevisions() { throw new TypeError("fetch failed"); },
  };
  const page = await service(entity, remote).list({ experienceId: "exp-1" });
  assert.equal(page.unavailable, true);
  assert.equal(page.pendingRevision?.content, "Local pending");
  assert.equal(page.items.length, 0);
});

class FakeRemote implements ExperienceRevisionReader {
  calls = 0;
  public constructor(private readonly items: ExperienceRevision[]) {}
  async listExperienceRevisions() {
    this.calls += 1;
    return { items: this.items, nextCursor: null };
  }
}

function service(entity: LocalEntity, remote: ExperienceRevisionReader) {
  const local = { getEntity: () => entity } as unknown as LocalSyncStore;
  return new ExperienceHistoryService(local, remote);
}

function pendingEntity(localBody: string, serverBody: string): LocalEntity {
  const local = buildLocalExperience("exp-1", "local-rev", input(localBody), NOW);
  const server = buildLocalExperience("exp-1", "server-rev", input(serverBody), NOW);
  return localEntity(local, {
    entityVersion: 3,
    syncStatus: "pending",
    lastServerOperation: "upsert",
    lastServerPayload: server,
  });
}

function localEntity(
  payload: Record<string, unknown>,
  overrides: Partial<LocalEntity>,
): LocalEntity {
  return {
    entityType: "experience", entityId: "exp-1", entityVersion: 1,
    localVersion: 2, syncStatus: "clean", operation: "upsert",
    changedAt: NOW, payload, ...overrides,
  };
}

function input(content: string) {
  return { category: "work" as const, title: "Engineer", content };
}

function revision(id: string, content: string): ExperienceRevision {
  return {
    id, experienceId: "exp-1", content, source: "manual",
    revisionHash: null, factBankStatus: "not_applicable", createdAt: NOW,
  };
}

const NOW = "2026-07-29T00:00:00.000Z";
