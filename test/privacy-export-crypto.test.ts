import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptExportPayload,
  encryptExportPayload,
  EXPORT_MAX_BYTES,
  EXPORT_SCRYPT,
  type EncryptedExportPayload,
} from "../src/privacy/export-crypto.js";
import {
  buildExportAad,
  buildManifestBody,
  canonicalExportJson,
  manifestRootSha256,
  offlineScopeDigest,
} from "../src/privacy/export-canonical.js";
import { buildExportPackage } from "../src/privacy/export-package.js";
import type { ExportScope, ExportSnapshotView } from "../src/privacy/export-types.js";
import type { CloudExportSnapshotV1 } from "../src/privacy/types.js";

const scope: ExportScope = {
  cloudAssets: true,
  localConversations: false,
  localDrafts: false,
  localTasks: false,
  rawFiles: false,
};
const snapshotView: ExportSnapshotView = {
  mode: "synchronized",
  capturedAt: "2026-09-08T00:00:00Z",
  syncIssues: 0,
};
const snapshot: CloudExportSnapshotV1 = {
  schemaVersion: 1,
  snapshotId: "snapshot-1",
  capturedAt: snapshotView.capturedAt,
  policyVersion: "privacy-2026-09-08-v1",
  accountScopeDigest: "a".repeat(64),
  entries: [{ path: "cloud/profile.json", kind: "profile", bytes: 12, sha256: "b".repeat(64), protected: true, value: { name: "Alice" } }],
  relationships: [],
  counts: { profile: 1 },
  relationshipCount: 0,
  relationshipSha256: "c".repeat(64),
  rootSha256: "d".repeat(64),
};

test("export manifest root excludes itself and AAD is deterministic", () => {
  const body = buildManifestBody(snapshot, scope, []);
  const root = manifestRootSha256(body);
  assert.equal(root, manifestRootSha256(structuredClone(body)));
  assert.equal(canonicalExportJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.doesNotMatch(canonicalExportJson(body), /rootSha256/u);
  const aad = buildExportAad("coolto-data-export", "export-1", scope, snapshotView, body, root);
  assert.equal(aad, buildExportAad("coolto-data-export", "export-1", scope, snapshotView, body, root));
  assert.match(aad, /manifestBody/u);
});

test("export package has exact envelope fields and marks local entries", async () => {
  const envelope = await buildExportPackage({
    snapshot,
    local: { conversations: [{ content: "hello" }] },
    includeConversations: true,
    includeDrafts: false,
    includeTasks: false,
    passphrase: "correct horse battery",
    mode: "synchronized",
    exportId: "export-1",
    createdAt: "2026-09-08T00:00:00Z",
  });
  assert.equal("payload" in envelope.encryption, false);
  assert.equal(envelope.manifest.body.entries.find((entry) => entry.kind === "profile")?.localOnly, false);
  assert.equal(envelope.manifest.body.entries.find((entry) => entry.kind === "local_conversations")?.localOnly, true);
  const aad = buildExportAad(
    envelope.format,
    envelope.exportId,
    envelope.scope,
    envelope.snapshot,
    envelope.manifest.body,
    envelope.manifest.rootSha256,
  );
  const encrypted: EncryptedExportPayload = { ...envelope.encryption, payload: envelope.payload };
  const payload = JSON.parse((await decryptExportPayload(encrypted, "correct horse battery", aad)).toString("utf8")) as { local: { conversations?: unknown[] } };
  assert.deepEqual(payload.local.conversations, [{ content: "hello" }]);
  assert.doesNotMatch(JSON.stringify(payload), /ownerId|access_token|refresh_token/u);
});

test("local-only export binds its opaque digest to owner and API origin", async () => {
  const ownerA = offlineScopeDigest("http://localhost:8000", "user-a");
  const ownerB = offlineScopeDigest("http://localhost:8000", "user-b");
  const otherOrigin = offlineScopeDigest("http://localhost:9000", "user-a");
  assert.notEqual(ownerA, ownerB);
  assert.notEqual(ownerA, otherOrigin);
  const envelope = await buildExportPackage({
    snapshot: null,
    accountScopeDigest: ownerA,
    local: { tasks: [{ kind: "resume", title: "Review", status: "completed" }] },
    includeConversations: false,
    includeDrafts: false,
    includeTasks: true,
    passphrase: "correct horse battery",
    mode: "offline_stale",
    exportId: "offline-export",
    createdAt: "2026-09-08T00:00:00Z",
  });
  assert.equal(envelope.scope.cloudAssets, false);
  assert.equal(envelope.manifest.body.accountScopeDigest, ownerA);
  assert.equal(envelope.manifest.body.entries[0]?.localOnly, true);
});
test("export rejects nested mandatory secret and external-content keys", async () => {
  for (const key of [
    "oauth_access_token",
    "browser_login_state",
    "mail_connection_secret",
    "raw_external_content",
  ]) {
    await assert.rejects(
      buildExportPackage({
        snapshot: null,
        accountScopeDigest: offlineScopeDigest("http://localhost:8000", "user-a"),
        local: { conversations: [{ [key]: "secret-value" }] },
        includeConversations: true,
        includeDrafts: false,
        includeTasks: false,
        passphrase: "correct horse battery",
        mode: "offline_stale",
      }),
      /禁止字段/u,
    );
  }
});

test("export crypto enforces portable scrypt bounds and authenticates AAD", async () => {
  assert.deepEqual(EXPORT_SCRYPT, { N: 32_768, r: 8, p: 1, keyLength: 32, maxMemoryBytes: 64 * 1024 * 1024 });
  assert.equal(128 * EXPORT_SCRYPT.r * EXPORT_SCRYPT.N <= EXPORT_SCRYPT.maxMemoryBytes, true);
  const aad = "canonical-aad";
  const plaintext = Buffer.from("private export content", "utf8");
  const encrypted = await encryptExportPayload(plaintext, "correct horse battery", aad);
  assert.equal(Buffer.from(encrypted.salt, "base64").length, 16);
  assert.equal(Buffer.from(encrypted.nonce, "base64").length, 12);
  assert.equal(Buffer.from(encrypted.tag, "base64").length, 16);
  assert.ok(Buffer.byteLength(encrypted.payload, "utf8") < EXPORT_MAX_BYTES);
  assert.deepEqual(await decryptExportPayload(encrypted, "correct horse battery", aad), plaintext);
  await assert.rejects(decryptExportPayload(encrypted, "wrong horse battery", aad));
  await assert.rejects(decryptExportPayload({ ...encrypted, aadSha256: "0".repeat(64) }, "correct horse battery", aad), /AAD/u);
  await assert.rejects(encryptExportPayload(Buffer.alloc(EXPORT_MAX_BYTES + 1), "correct horse battery", aad), /64 MiB/u);
});
