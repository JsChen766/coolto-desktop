import assert from "node:assert/strict";
import test from "node:test";

import { hashMaterialBytes } from "../src/material/material-identity.js";
import { ocrResultHash } from "../src/material/material-ocr-contract.js";
import { MaterialExportService } from "../src/material/material-export.js";
import { MaterialOcrService, type MaterialOcrWorkerPort } from "../src/material/material-ocr-service.js";
import { MemoryMaterialRepository, type MaterialOcrSegmentRecord, type MaterialStoredRecord } from "../src/material/material-repository.js";

function record(): MaterialStoredRecord {
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId: "mat_ocr", ownerId: "owner-a", contentHash: hashMaterialBytes(Buffer.from([1, 2, 3])), contentVersion: 1 },
      metadata: { title: "扫描件", mediaKind: "png", sourceKind: "user_upload", sourceLabel: null, originalFilename: "scan.png", capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "unprocessed", ocr: null },
    },
    lifecycleStatus: "queued", bytes: Buffer.from([1, 2, 3]), parsedText: null, parsedChunks: [],
    ocrText: null, ocrSegments: [], relations: [], lastError: null,
  };
}

function worker(confidence: number, text = "OCR text"): MaterialOcrWorkerPort {
  const segment: MaterialOcrSegmentRecord = { segmentId: "ocr-1", text, confidence, page: 1, bbox: { x: 1, y: 2, width: 3, height: 4 } };
  return {
    process: async () => ({ text, overallConfidence: confidence, segments: [segment], engine: { name: "test-local", version: "1" } }),
    cancel: async () => undefined,
    close: async () => undefined,
  };
}

test("high confidence local OCR becomes ready with bbox evidence and expiry", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save(record());
  const service = new MaterialOcrService(repository, worker(0.96), { now: () => "2026-01-03T00:00:00.000Z" });
  await service.process("mat_ocr");
  const current = await repository.get("mat_ocr");
  assert.equal(current?.lifecycleStatus, "ready");
  assert.equal(current?.asset.processing.ocr?.needsUserConfirmation, false);
  assert.equal(current?.ocrSegments[0]?.bbox?.width, 3);
  assert.equal(current?.asset.processing.ocr?.expiresAt, "2026-02-02T00:00:00.000Z");
});

test("low confidence OCR requires explicit confirmation before ready", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save(record());
  const service = new MaterialOcrService(repository, worker(0.42));
  await service.process("mat_ocr");
  assert.equal((await repository.get("mat_ocr"))?.lifecycleStatus, "needs_confirmation");
  await service.confirm("mat_ocr", "corrected text");
  const confirmed = await repository.get("mat_ocr");
  assert.equal(confirmed?.lifecycleStatus, "ready");
  assert.equal(confirmed?.asset.processing.ocr?.needsUserConfirmation, false);
  assert.equal(confirmed?.ocrText, "corrected text");
  assert.ok(confirmed);
  const ocr = confirmed.asset.processing.ocr;
  const binding = confirmed.ocrBinding;
  if (!binding || !ocr?.engine || ocr.overallConfidence === null) throw new Error("confirmed OCR binding is incomplete");
  assert.equal(binding.resultHash, ocrResultHash({ text: confirmed.ocrText ?? "", overallConfidence: ocr.overallConfidence, segments: [...confirmed.ocrSegments], engine: ocr.engine }));
  const restored = new MemoryMaterialRepository("owner-a");
  assert.equal(await new MaterialExportService(restored).restore("owner-a", await new MaterialExportService(repository).encode("owner-a")), 1);
});

test("closing OCR rejects queued work and prevents new jobs", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  const first = record();
  const second = {
    ...record(),
    asset: {
      ...record().asset,
      identity: { ...record().asset.identity, materialId: "mat_ocr_2", contentHash: "c".repeat(64) },
      metadata: { ...record().asset.metadata, originalFilename: "scan-2.png" },
    },
    bytes: Buffer.from([4, 5, 6]),
  };
  await repository.save(first);
  await repository.save(second);
  let rejectActive: ((error: Error) => void) | undefined;
  const delayed: MaterialOcrWorkerPort = {
    process: () => new Promise((_resolve, reject) => { rejectActive = reject; }),
    cancel: async () => undefined,
    close: async () => { rejectActive?.(new Error("worker closed")); },
  };
  const service = new MaterialOcrService(repository, delayed);
  const active = service.process(first.asset.identity.materialId);
  const activeRejection = assert.rejects(active, /worker closed/u);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const queued = service.process(second.asset.identity.materialId);
  await service.close();
  await assert.rejects(queued, /服务已关闭/u);
  await activeRejection;
  await assert.rejects(service.process(first.asset.identity.materialId), /服务已关闭/u);
});
