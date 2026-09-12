import assert from "node:assert/strict";
import test from "node:test";

import { MemoryMaterialRepository, type MaterialStoredRecord } from "../src/material/material-repository.js";
import { MaterialViewService } from "../src/material/material-view.js";

function record(
  materialId: string,
  title: string,
  parsedText: string | null,
  ocrText: string | null,
): MaterialStoredRecord {
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId, ownerId: "owner-a", contentHash: materialId.replace(/[^a-f0-9]/gu, "a").slice(0, 64).padEnd(64, "a"), contentVersion: 1 },
      metadata: { title, mediaKind: "text", sourceKind: "user_upload", sourceLabel: "archive", originalFilename: `${materialId}.txt`, capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready", classification: "unclassified", bytes: Buffer.from(materialId),
    parsedText, parsedChunks: [], ocrText, ocrSegments: [], relations: [], lastError: null,
  };
}

test("host material search uses metadata, parsed text, and OCR text as OR alternatives", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.saveMany([
    record("mat_metadata", "metadata-only-needle", null, null),
    record("mat_parsed", "Quarterly notes", "parsed-only-needle", null),
    record("mat_ocr", "Scanned notes", null, "ocr-only-needle"),
  ]);
  const views = new MaterialViewService(repository);

  assert.deepEqual((await views.search({ query: "metadata-only-needle" })).map((item) => item.materialId), ["mat_metadata"]);
  assert.deepEqual((await views.search({ query: "parsed-only-needle" })).map((item) => item.materialId), ["mat_parsed"]);
  assert.deepEqual((await views.search({ query: "ocr-only-needle" })).map((item) => item.materialId), ["mat_ocr"]);
  assert.deepEqual((await views.list({ query: "parsed-only-needle" })).map((item) => item.materialId), ["mat_parsed"]);
});

test("full-text host search still applies status and classification filters", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.saveMany([
    record("mat_allowed", "One", "shared-needle", null),
    { ...record("mat_failed", "Two", "shared-needle", null), lifecycleStatus: "failed" },
  ]);
  const views = new MaterialViewService(repository);

  assert.deepEqual(
    (await views.search({ query: "shared-needle", status: "unclassified", classification: "unclassified" })).map((item) => item.materialId),
    ["mat_allowed"],
  );
});
