import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExportAad,
  offlineScopeDigest,
} from "../src/privacy/export-canonical.js";
import { decryptExportPayload } from "../src/privacy/export-crypto.js";
import { buildExportPackage } from "../src/privacy/export-package.js";
import type { CloudExportSnapshotV1 } from "../src/privacy/types.js";

function fixtureSnapshot(): CloudExportSnapshotV1 {
  const entries = [
    entry("cloud/experiences/exp-1.json", "experience", { title: "Intern", id: "exp-1" }),
    entry("cloud/experiences/exp-2.json", "experience", { title: "Project", id: "exp-2" }),
    entry("cloud/jds/jd-1.json", "jd", { title: "SWE Intern", id: "jd-1" }),
    entry("cloud/resumes/resume-1.json", "resume", { title: "Resume A", id: "resume-1" }),
    entry("cloud/applications/app-1.json", "application", {
      id: "app-1", jdId: "jd-1", resumeId: "resume-1",
    }),
  ];
  const relationships = [
    { from: "experience:exp-1", relation: "used_by", to: "resume:resume-1" },
    { from: "jd:jd-1", relation: "applied_with", to: "application:app-1" },
    { from: "resume:resume-1", relation: "attached_to", to: "application:app-1" },
  ];
  return {
    schemaVersion: 1,
    snapshotId: "snap-reconcile-1",
    capturedAt: "2026-10-18T12:00:00.000Z",
    policyVersion: "privacy-2026-10-18-v1",
    accountScopeDigest: "f".repeat(64),
    entries,
    relationships,
    counts: {
      experience: 2,
      jd: 1,
      resume: 1,
      application: 1,
    },
    relationshipCount: relationships.length,
    relationshipSha256: "e".repeat(64),
    rootSha256: "d".repeat(64),
  };
}

function entry(path: string, kind: string, value: Record<string, unknown>) {
  const body = JSON.stringify(value);
  return {
    path,
    kind,
    bytes: Buffer.byteLength(body, "utf8"),
    sha256: "a".repeat(64),
    protected: true as const,
    value,
  };
}

test("export package manifest counts match UI-visible asset kinds", async () => {
  const snapshot = fixtureSnapshot();
  const envelope = await buildExportPackage({
    snapshot,
    local: {
      conversations: [{ id: "c1", title: "Chat" }],
      drafts: [{ id: "d1", artifactId: "resume-1" }],
      tasks: [{ id: "t1", status: "completed" }],
    },
    includeConversations: true,
    includeDrafts: true,
    includeTasks: true,
    passphrase: "correct horse battery staple",
    mode: "synchronized",
    exportId: "reconcile-1",
    createdAt: "2026-10-18T12:00:00.000Z",
  });

  const { counts, entries, relationshipCount } = envelope.manifest.body;
  assert.equal(counts.experience, 2);
  assert.equal(counts.jd, 1);
  assert.equal(counts.resume, 1);
  assert.equal(counts.application, 1);
  assert.equal(counts.local_conversations, 1);
  assert.equal(counts.local_drafts, 1);
  assert.equal(counts.local_tasks, 1);
  assert.equal(relationshipCount, 3);

  for (const kind of ["experience", "jd", "resume", "application"]) {
    const found = entries.filter((item) => item.kind === kind);
    assert.equal(found.length, counts[kind]);
    assert.equal(found.every((item) => item.localOnly === false), true);
  }
  for (const kind of ["local_conversations", "local_drafts", "local_tasks"]) {
    const found = entries.filter((item) => item.kind === kind);
    assert.equal(found.length, 1);
    assert.equal(found[0]?.localOnly, true);
  }

  const aad = buildExportAad(
    envelope.format,
    envelope.exportId,
    envelope.scope,
    envelope.snapshot,
    envelope.manifest.body,
    envelope.manifest.rootSha256,
  );
  const plain = await decryptExportPayload(
    {
      ...envelope.encryption,
      payload: envelope.payload,
    },
    "correct horse battery staple",
    aad,
  );
  const payload = JSON.parse(plain.toString("utf8")) as {
    cloud: { entries: unknown[]; relationships: unknown[] };
    local: { conversations: unknown[]; drafts: unknown[]; tasks: unknown[] };
  };
  assert.equal(payload.cloud.entries.length, 5);
  assert.equal(payload.cloud.relationships.length, 3);
  assert.equal(payload.local.conversations.length, 1);
  assert.equal(payload.local.drafts.length, 1);
  assert.equal(payload.local.tasks.length, 1);
  assert.doesNotMatch(JSON.stringify(payload), /api_key|passphrase|access_token|ownerId/u);
});

test("local-only export still rejects secret fields and keeps desensitization", async () => {
  const digest = offlineScopeDigest("http://127.0.0.1:9", "owner-local");
  await assert.rejects(
    buildExportPackage({
      snapshot: null,
      accountScopeDigest: digest,
      local: { conversations: [{ api_key: "sk-should-never-export" }] },
      includeConversations: true,
      includeDrafts: false,
      includeTasks: false,
      passphrase: "correct horse battery staple",
      mode: "offline_stale",
    }),
    /禁止字段/u,
  );

  const envelope = await buildExportPackage({
    snapshot: null,
    accountScopeDigest: digest,
    local: {
      conversations: [{ id: "c1", title: "Safe" }],
      tasks: [{ id: "t1", status: "queued" }],
    },
    includeConversations: true,
    includeDrafts: false,
    includeTasks: true,
    passphrase: "correct horse battery staple",
    mode: "offline_stale",
  });
  assert.equal(envelope.scope.cloudAssets, false);
  assert.equal(envelope.manifest.body.counts.local_conversations, 1);
  assert.equal(envelope.manifest.body.counts.local_tasks, 1);
  assert.equal(
    envelope.manifest.body.entries.every((item) => item.localOnly === true),
    true,
  );
  assert.doesNotMatch(JSON.stringify(envelope), /sk-should-never-export/u);
});
