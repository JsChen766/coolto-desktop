import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { EncryptedMaterialRepository } from "../src/material/material-repository.js";
import type { MaterialStoredRecord } from "../src/material/material-repository.js";

function record(ownerId = "owner-a"): MaterialStoredRecord {
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId: "mat_test", ownerId, contentHash: "a".repeat(64), contentVersion: 1 },
      metadata: { title: "季度复盘", mediaKind: "text", sourceKind: "user_upload", sourceLabel: "Q1", originalFilename: "review.txt", capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready", bytes: Buffer.from("private raw bytes"), parsedText: "private parsed text",
    parsedChunks: [{ id: "chunk-1", index: 0, label: "正文", text: "private parsed text" }],
    ocrText: null, ocrSegments: [], relations: [], lastError: null,
  };
}

test("encrypted material repository survives restart and keeps catalog ciphertext", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-repo-"));
  try {
    const key = randomBytes(32);
    const first = new EncryptedMaterialRepository(root, "owner-a", key);
    await first.save(record());
    const reopened = new EncryptedMaterialRepository(root, "owner-a", key);
    const restored = await reopened.get("mat_test");
    assert.equal(restored?.parsedText, "private parsed text");
    assert.deepEqual(Buffer.from(restored!.bytes), Buffer.from("private raw bytes"));
    const ownerRoot = join(root, Buffer.from("owner-a").toString("base64url"));
    const generations = await readdir(join(ownerRoot, "generations"));
    assert.equal(generations.length, 1);
    const catalogPath = join(ownerRoot, "generations", generations[0]!, "catalog.enc");
    const catalog = await readFile(catalogPath, "utf8");
    assert.equal(catalog.includes("private parsed text"), false);
    assert.equal(catalog.includes("private raw bytes"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("encrypted repository rejects cross-account writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-account-"));
  try {
    const repository = new EncryptedMaterialRepository(root, "owner-a", randomBytes(32));
    await assert.rejects(repository.save(record("owner-b")), /owner scope mismatch/u);
    assert.deepEqual(await repository.list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("restart recovers an interrupted OCR record to queued", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-restart-"));
  try {
    const key = randomBytes(32);
    const first = new EncryptedMaterialRepository(root, "owner-a", key);
    const interrupted = record();
    interrupted.lifecycleStatus = "processing";
    interrupted.asset.processing = { status: "processing", ocr: null };
    await first.save(interrupted);
    const reopened = new EncryptedMaterialRepository(root, "owner-a", key);
    const recovered = await reopened.get("mat_test");
    assert.equal(recovered?.lifecycleStatus, "queued");
    assert.equal(recovered?.asset.processing.status, "unprocessed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restart falls back to a complete prior generation when the active generation is partial", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-recovery-"));
  try {
    const key = randomBytes(32);
    const first = new EncryptedMaterialRepository(root, "owner-a", key);
    await first.save(record());
    const ownerRoot = join(root, Buffer.from("owner-a").toString("base64url"));
    const before = new Set(await readdir(join(ownerRoot, "generations")));
    await first.save({ ...record(), classification: "classified" });
    const active = (await readdir(join(ownerRoot, "generations"))).find((generation) => !before.has(generation));
    assert.ok(active);
    await rm(join(ownerRoot, "generations", active!, "raw", "mat_test.bin"));
    const reopened = new EncryptedMaterialRepository(root, "owner-a", key);
    assert.equal((await reopened.get("mat_test"))?.classification, "unclassified");
    assert.deepEqual(await readdir(join(ownerRoot, "generations")), [...before]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
