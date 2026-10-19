import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { PrivacyApi } from "../src/api/privacy-api.js";
import {
  buildExportAad,
  offlineScopeDigest,
} from "../src/privacy/export-canonical.js";
import { decryptExportPayload } from "../src/privacy/export-crypto.js";
import type { CloudExportSnapshotV1 } from "../src/privacy/types.js";
import { DataExportService } from "../src/desktop/main/privacy/data-export-service.js";
import { buildLocalBusinessSnapshot } from "../src/desktop/main/privacy/local-business-export-snapshot.js";
import type { LocalEntity } from "../src/desktop/main/sync/local-sync-types.js";
import type { SyncEntityType } from "../src/sync/types.js";

const PASSPHRASE = "correct horse battery staple";
const OWNER = "owner-export-full";
const API = "local://desktop";
const DIGEST = offlineScopeDigest(API, OWNER);
const FIXED_NOW = new Date("2026-10-19T10:00:00.000Z");

function entity(
  entityType: SyncEntityType,
  entityId: string,
  payload: Record<string, unknown>,
): LocalEntity {
  return {
    entityType,
    entityId,
    entityVersion: 1,
    localVersion: 1,
    syncStatus: "clean",
    operation: "upsert",
    changedAt: "2026-10-19T09:00:00.000Z",
    payload,
  };
}

function memorySource(entities: LocalEntity[]) {
  return {
    listEntities(entityType: SyncEntityType): LocalEntity[] {
      return entities.filter((item) => item.entityType === entityType);
    },
  };
}

function cloudFixture(): CloudExportSnapshotV1 {
  const entries = [
    {
      path: "cloud/experiences/exp-1.json", kind: "experience", bytes: 20,
      sha256: "a".repeat(64), protected: true as const,
      value: { id: "exp-1", title: "Intern" },
    },
    {
      path: "cloud/jds/jd-1.json", kind: "jd", bytes: 20,
      sha256: "b".repeat(64), protected: true as const,
      value: { id: "jd-1", title: "SWE" },
    },
    {
      path: "cloud/resumes/resume-1.json", kind: "resume", bytes: 20,
      sha256: "c".repeat(64), protected: true as const,
      value: { id: "resume-1", title: "Resume A" },
    },
    {
      path: "cloud/applications/app-1.json", kind: "application", bytes: 20,
      sha256: "d".repeat(64), protected: true as const,
      value: { id: "app-1", jdId: "jd-1", resumeId: "resume-1" },
    },
  ];
  return {
    schemaVersion: 1,
    snapshotId: "snap-full-1",
    capturedAt: "2026-10-19T10:00:00.000Z",
    policyVersion: "privacy-2026-10-18-v1",
    accountScopeDigest: DIGEST,
    entries,
    relationships: [
      { from: "jd:jd-1", relation: "applied_with", to: "application:app-1" },
      { from: "resume:resume-1", relation: "attached_to", to: "application:app-1" },
    ],
    counts: { experience: 1, jd: 1, resume: 1, application: 1 },
    relationshipCount: 2,
    relationshipSha256: "e".repeat(64),
    rootSha256: "f".repeat(64),
  };
}

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "coolto-export-full-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("full export path: DataExportService writes decryptable package with UI asset kinds", async () => {
  await withTempDir(async (dir) => {
    const destination = join(dir, "coolto-export-v1-full.coolto-export.json");
    const api = {
      exportSnapshot: async () => cloudFixture(),
    } as Pick<PrivacyApi, "exportSnapshot">;
    const service = new DataExportService(
      api as PrivacyApi,
      {
        read: async () => ({
          payload: {
            conversations: [{ id: "c1", title: "Chat" }],
            drafts: [{ artifactId: "resume-1", title: "Draft" }],
            tasks: [{ status: "completed", title: "Task" }],
          },
          hasPending: false,
        }),
      },
      { choosePath: async () => destination },
      () => ({ ownerId: OWNER, apiBaseUrl: API, scopeDigest: DIGEST }),
      null,
      () => FIXED_NOW,
    );

    const result = await service.export({
      includeCloudAssets: true,
      includeConversations: true,
      includeDrafts: true,
      includeTasks: true,
      passphrase: PASSPHRASE,
    });
    assert.equal(result.status, "exported");
    assert.equal(result.fileName, "coolto-export-v1-full.coolto-export.json");
    assert.equal(result.mode, "synchronized");

    const envelope = JSON.parse(await readFile(destination, "utf8")) as {
      format: string;
      exportId: string;
      scope: { cloudAssets: boolean };
      snapshot: { mode: string };
      manifest: { body: {
        counts: Record<string, number>;
        entries: Array<{ kind: string; localOnly: boolean }>;
        relationshipCount: number;
      }; rootSha256: string };
      encryption: {
        kdf: "scrypt";
        kdfParams: { N: number; r: number; p: number; keyLength: number; maxMemoryBytes: number };
        cipher: "aes-256-gcm";
        salt: string; nonce: string; tag: string; aadSha256: string;
      };
      payload: string;
    };
    assert.equal(envelope.format, "coolto-data-export");
    assert.equal(envelope.scope.cloudAssets, true);
    assert.equal(envelope.snapshot.mode, "synchronized");
    assert.equal(envelope.manifest.body.counts.experience, 1);
    assert.equal(envelope.manifest.body.counts.jd, 1);
    assert.equal(envelope.manifest.body.counts.resume, 1);
    assert.equal(envelope.manifest.body.counts.application, 1);
    assert.equal(envelope.manifest.body.counts.local_conversations, 1);
    assert.equal(envelope.manifest.body.counts.local_drafts, 1);
    assert.equal(envelope.manifest.body.counts.local_tasks, 1);
    assert.equal(envelope.manifest.body.relationshipCount, 2);

    const aad = buildExportAad(
      envelope.format as "coolto-data-export",
      envelope.exportId,
      envelope.scope as never,
      envelope.snapshot as never,
      envelope.manifest.body as never,
      envelope.manifest.rootSha256,
    );
    const plain = await decryptExportPayload(
      { ...envelope.encryption, payload: envelope.payload },
      PASSPHRASE,
      aad,
    );
    const payload = JSON.parse(plain.toString("utf8")) as {
      cloud: { entries: unknown[]; relationships: unknown[] };
      local: { conversations: unknown[]; drafts: unknown[]; tasks: unknown[] };
    };
    assert.equal(payload.cloud.entries.length, 4);
    assert.equal(payload.cloud.relationships.length, 2);
    assert.equal(payload.local.conversations.length, 1);
    assert.doesNotMatch(JSON.stringify(payload), /api_key|passphrase|access_token|ownerId|owner_id/u);
    assert.doesNotMatch(JSON.stringify(envelope), /correct horse battery staple/u);
  });
});

test("OSS local-only full path: sync business assets + optional locals, written to disk", async () => {
  await withTempDir(async (dir) => {
    const destination = join(dir, "coolto-export-oss-local.coolto-export.json");
    const source = memorySource([
      entity("experience", "exp-1", { id: "exp-1", title: "Intern", ownerId: "must-strip" }),
      entity("experience", "exp-2", { id: "exp-2", title: "Project" }),
      entity("job_description", "jd-1", { id: "jd-1", title: "SWE Intern" }),
      entity("resume", "resume-1", {
        id: "resume-1", title: "Resume A", experienceIds: ["exp-1"],
      }),
      entity("application", "app-1", {
        id: "app-1", jdId: "jd-1", resumeId: "resume-1", companyName: "Acme",
      }),
    ]);
    const api = {
      exportSnapshot: async () => {
        throw new Error("OSS must not call cloud exportSnapshot");
      },
    } as Pick<PrivacyApi, "exportSnapshot">;

    const service = new DataExportService(
      api as PrivacyApi,
      {
        read: async () => ({
          payload: {
            conversations: [{ id: "c1", title: "Local chat" }],
            drafts: [{ artifactId: "resume-1" }],
            tasks: [{ status: "queued", title: "Scout" }],
          },
          hasPending: false,
        }),
      },
      { choosePath: async () => destination },
      () => ({ ownerId: OWNER, apiBaseUrl: API, scopeDigest: DIGEST }),
      {
        read: async (scope) => buildLocalBusinessSnapshot({
          source,
          accountScopeDigest: scope.scopeDigest,
          capturedAt: FIXED_NOW.toISOString(),
          snapshotId: "local-snap-1",
        }),
      },
      () => FIXED_NOW,
    );

    const result = await service.export({
      includeCloudAssets: false,
      includeConversations: true,
      includeDrafts: true,
      includeTasks: true,
      passphrase: PASSPHRASE,
    });
    assert.equal(result.status, "exported");
    assert.equal(result.mode, "offline_stale");

    const envelope = JSON.parse(await readFile(destination, "utf8")) as {
      format: string;
      exportId: string;
      scope: { cloudAssets: boolean; localConversations: boolean };
      snapshot: { mode: string };
      manifest: { body: {
        counts: Record<string, number>;
        entries: Array<{ kind: string; localOnly: boolean; path: string }>;
        relationshipCount: number;
      }; rootSha256: string };
      encryption: {
        kdf: "scrypt";
        kdfParams: { N: number; r: number; p: number; keyLength: number; maxMemoryBytes: number };
        cipher: "aes-256-gcm";
        salt: string; nonce: string; tag: string; aadSha256: string;
      };
      payload: string;
    };
    assert.equal(envelope.scope.cloudAssets, false);
    assert.equal(envelope.snapshot.mode, "offline_stale");
    assert.equal(envelope.manifest.body.counts.experience, 2);
    assert.equal(envelope.manifest.body.counts.jd, 1);
    assert.equal(envelope.manifest.body.counts.resume, 1);
    assert.equal(envelope.manifest.body.counts.application, 1);
    assert.equal(envelope.manifest.body.counts.local_conversations, 1);
    assert.equal(envelope.manifest.body.relationshipCount, 3);
    for (const kind of ["experience", "jd", "resume", "application"]) {
      const found = envelope.manifest.body.entries.filter((item) => item.kind === kind);
      assert.equal(found.length, envelope.manifest.body.counts[kind]);
      assert.equal(found.every((item) => item.localOnly === true), true);
      assert.equal(found.every((item) => item.path.startsWith("local-business/")), true);
    }

    const aad = buildExportAad(
      envelope.format as "coolto-data-export",
      envelope.exportId,
      envelope.scope as never,
      envelope.snapshot as never,
      envelope.manifest.body as never,
      envelope.manifest.rootSha256,
    );
    const plain = await decryptExportPayload(
      { ...envelope.encryption, payload: envelope.payload },
      PASSPHRASE,
      aad,
    );
    const payload = JSON.parse(plain.toString("utf8")) as {
      cloud: { entries: Array<{ value: Record<string, unknown> }>; relationships: unknown[] };
      local: { conversations: unknown[] };
    };
    assert.equal(payload.cloud.entries.length, 5);
    assert.equal(payload.cloud.relationships.length, 3);
    assert.equal(payload.local.conversations.length, 1);
    assert.doesNotMatch(JSON.stringify(payload), /must-strip|ownerId|api_key|passphrase/u);
  });
});

test("full export path: save dialog cancel returns cancelled without writing", async () => {
  const service = new DataExportService(
    { exportSnapshot: async () => cloudFixture() } as PrivacyApi,
    { read: async () => ({ payload: {}, hasPending: false }) },
    { choosePath: async () => undefined },
    () => ({ ownerId: OWNER, apiBaseUrl: API, scopeDigest: DIGEST }),
    null,
    () => FIXED_NOW,
  );
  const result = await service.export({
    includeCloudAssets: true,
    includeConversations: false,
    includeDrafts: false,
    includeTasks: false,
    passphrase: PASSPHRASE,
  });
  assert.deepEqual(result, { status: "cancelled", fileName: null, mode: null });
});

test("buildLocalBusinessSnapshot strips forbidden keys and skips deletes", () => {
  const live = entity("experience", "exp-live", {
    id: "exp-live", title: "Live", owner_id: "x",
  });
  const gone = {
    ...entity("experience", "exp-gone", { id: "exp-gone", title: "Gone" }),
    operation: "delete" as const,
  };
  const snapshot = buildLocalBusinessSnapshot({
    source: memorySource([live, gone]),
    accountScopeDigest: DIGEST,
    capturedAt: FIXED_NOW.toISOString(),
    snapshotId: "snap-sanitize",
  });
  assert.equal(snapshot.counts.experience, 1);
  assert.equal(snapshot.entries.length, 1);
  assert.doesNotMatch(JSON.stringify(snapshot.entries[0]?.value), /owner_id|ownerId/u);
});
