import assert from "node:assert/strict";
import test from "node:test";

import { hashMaterialBytes } from "../src/material/material-identity.js";
import { ocrResultHash } from "../src/material/material-ocr-contract.js";
import { MaterialExportService } from "../src/material/material-export.js";
import { MemoryMaterialRepository, type MaterialStoredRecord } from "../src/material/material-repository.js";
function record(): MaterialStoredRecord {
  const contentHash = hashMaterialBytes(Buffer.from("export bytes"));
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId: "mat_export", ownerId: "owner-a", contentHash, contentVersion: 1 },
      metadata: { title: "导出材料", mediaKind: "text", sourceKind: "user_upload", sourceLabel: null, originalFilename: "export.txt", capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready", classification: "classified", bytes: Buffer.from("export bytes"), parsedText: "local text", parsedChunks: [], ocrText: null, ocrSegments: [],
    relations: [{ relationId: "relation-1", experienceId: "experience-a", citations: [{
      schema: "material.citation", version: 1, ownerId: "owner-a", materialId: "mat_export",
      materialHash: contentHash, materialVersion: 1,
      location: { kind: "page", page: 1, sectionLabel: null },
    }], createdAt: "2026-01-02T03:04:05.000Z" }],
    lastError: null,
  };
}

test("feature export and restore preserves raw hash and relations locally", async () => {
  const source = new MemoryMaterialRepository("owner-a");
  const sourceRecord = record();
  sourceRecord.asset.identity.contentHash = hashMaterialBytes(sourceRecord.bytes);
  await source.save(sourceRecord);
  const payload = await new MaterialExportService(source).encode("owner-a");
  const target = new MemoryMaterialRepository("owner-a");
  const restored = await new MaterialExportService(target).restore("owner-a", payload);
  assert.equal(restored, 1);
  const copy = await target.get("mat_export");
  assert.deepEqual(Buffer.from(copy!.bytes), Buffer.from("export bytes"));
  assert.equal(copy?.relations[0]?.experienceId, "experience-a");
});

test("restore rejects another account package", async () => {
  const source = new MemoryMaterialRepository("owner-a");
  const value = record();
  value.asset.identity.contentHash = hashMaterialBytes(value.bytes);
  await source.save(value);
  const payload = await new MaterialExportService(source).encode("owner-a");
  await assert.rejects(
    new MaterialExportService(new MemoryMaterialRepository("owner-b")).restore("owner-b", payload),
    /账号范围/u,
  );
});

test("restore rejects malformed relation, citation, time, and path-alias tampering without partial mutation", async () => {
  const source = new MemoryMaterialRepository("owner-a");
  await source.save(record());
  const original = JSON.parse((await new MaterialExportService(source).encode("owner-a")).toString("utf8")) as {
    records: Array<Record<string, unknown>>;
  };
  const mutations: Array<(value: { records: Array<Record<string, unknown>> }) => void> = [
    (value) => { value.records[0]!.absolutePath = "C:/secret.txt"; },
    (value) => { value.records[0]!.path = "C:/secret.txt"; },
    (value) => { value.records[0]!.raw = "raw-body-alias"; },
    (value) => { value.records[0]!.rawPath = "../raw.bin"; },
    (value) => { value.records[0]!.createdAt = "not-a-time"; },
    (value) => { value.records[0]!.lifecycleStatus = "invented"; },
    (value) => { (value.records[0]!.relations as Array<Record<string, unknown>>)[0]!.createdAt = "not-a-time"; },
    (value) => { ((value.records[0]!.relations as Array<Record<string, unknown>>)[0]!.citations as unknown[])[0] = { arbitrary: "not-a-material-citation", absolutePath: "C:/secret.txt" }; },
    (value) => { value.records[0]!.ocrBinding = { ownerId: "owner-a", absolutePath: "C:/secret.txt" }; },
  ];

  for (const mutate of mutations) {
    const candidate = structuredClone(original);
    mutate(candidate);
    const target = new MemoryMaterialRepository("owner-a");
    await assert.rejects(new MaterialExportService(target).restore("owner-a", Buffer.from(JSON.stringify(candidate))), /材料导出包/u);
    assert.deepEqual(await target.list(), []);
  }
});

test("restore rejects sparse and accessor-shaped package fields before they can be read", async () => {
  const source = new MemoryMaterialRepository("owner-a");
  await source.save(record());
  const original = JSON.parse((await new MaterialExportService(source).encode("owner-a")).toString("utf8")) as { records: Array<Record<string, unknown>> };
  const sparse = structuredClone(original);
  sparse.records = new Array<Record<string, unknown>>(1);
  const accessor = structuredClone(original);
  Object.defineProperty(accessor.records[0]!, "relations", { enumerable: true, get: () => { throw new Error("must not read accessor"); } });

  for (const candidate of [sparse, accessor]) {
    const target = new MemoryMaterialRepository("owner-a");
    await assert.rejects(new MaterialExportService(target).restore("owner-a", candidate as never), /材料导出包/u);
    assert.deepEqual(await target.list(), []);
  }
});

test("restore binds OCR evidence to the exact material version and rejects unknown binding fields", async () => {
  const source = new MemoryMaterialRepository("owner-a");
  const value = record();
  value.asset.metadata.mediaKind = "png";
  value.asset.processing = {
    status: "completed",
    ocr: {
      schema: "material.ocr-confidence", version: 1, engine: { name: "fixture", version: "1.0" }, processingStatus: "completed",
      overallConfidence: 0.9, segments: [{ segmentId: "ocr-segment-1", confidence: 0.9 }], needsUserConfirmation: false,
      confirmedAt: null, expiresAt: "2026-12-31T00:00:00.000Z",
    },
  };
  value.ocrText = "OCR evidence";
  value.ocrSegments = [{ segmentId: "ocr-segment-1", text: "OCR evidence", confidence: 0.9, page: 1, bbox: null }];
  value.ocrBinding = {
    ownerId: "owner-a", materialHash: value.asset.identity.contentHash, materialVersion: 1, jobId: "ocr-job-1", resultHash: ocrResultHash({
      text: value.ocrText ?? "", overallConfidence: 0.9, segments: [...value.ocrSegments], engine: { name: "fixture", version: "1.0" },
    }),
    policy: { minimumOverallConfidence: 0.8, minimumSegmentConfidence: 0.75 }, confirmedAt: null,
  };
  await source.save(value);
  const original = JSON.parse((await new MaterialExportService(source).encode("owner-a")).toString("utf8")) as { records: Array<Record<string, unknown>> };
  const target = new MemoryMaterialRepository("owner-a");
  assert.equal(await new MaterialExportService(target).restore("owner-a", Buffer.from(JSON.stringify(original))), 1);

  for (const mutate of [
    (candidate: { records: Array<Record<string, unknown>> }) => { (candidate.records[0]!.ocrBinding as Record<string, unknown>).ownerId = "owner-b"; },
    (candidate: { records: Array<Record<string, unknown>> }) => { (candidate.records[0]!.ocrBinding as Record<string, unknown>).rawResultPath = "C:/secret.txt"; },
    (candidate: { records: Array<Record<string, unknown>> }) => { (candidate.records[0]!.ocrBinding as Record<string, unknown>).confirmedAt = "not-a-time"; },
    (candidate: { records: Array<Record<string, unknown>> }) => { delete (candidate.records[0]!.ocrBinding as Record<string, unknown>).confirmedAt; },
    (candidate: { records: Array<Record<string, unknown>> }) => { candidate.records[0]!.ocrText = "tampered OCR evidence"; },
  ]) {
    const candidate = structuredClone(original);
    mutate(candidate);
    await assert.rejects(new MaterialExportService(new MemoryMaterialRepository("owner-a")).restore("owner-a", Buffer.from(JSON.stringify(candidate))), /材料导出包/u);
  }
});
