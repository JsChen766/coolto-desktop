import assert from "node:assert/strict";
import test from "node:test";

import { hashMaterialBytes } from "../src/material/material-identity.js";
import { markOcrFailed } from "../src/material/material-ocr-contract.js";
import { MaterialOcrService, type MaterialOcrRequest, type MaterialOcrWorkerPort } from "../src/material/material-ocr-service.js";
import { MemoryMaterialRepository, type MaterialStoredRecord } from "../src/material/material-repository.js";

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

/** Simulates the encrypted repository's root lock staying busy (or the generation failing to load). */
class FlakyReadRepository extends MemoryMaterialRepository {
  public failReads = false;

  public override async get(materialId: string): Promise<MaterialStoredRecord | undefined> {
    if (this.failReads) throw new Error("材料本地锁繁忙");
    return super.get(materialId);
  }
}

function crashThenSucceed(repository: FlakyReadRepository, jobIds: string[]): MaterialOcrWorkerPort {
  return {
    process: async (request) => {
      jobIds.push(request.jobId);
      if (jobIds.length === 1) {
        repository.failReads = true;
        throw new Error("worker crashed");
      }
      return {
        text: "OCR text", overallConfidence: 0.96, engine: { name: "test-local", version: "1" },
        segments: [{ segmentId: "ocr-1", text: "OCR text", confidence: 0.96, page: 1, bbox: null }],
      };
    },
    cancel: async () => undefined,
    close: async () => undefined,
  };
}

test("OCR job settles and frees the material when persisting the failure also fails", { timeout: 5_000 }, async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    const repository = new FlakyReadRepository("owner-a");
    await repository.save(record());
    const jobIds: string[] = [];
    const service = new MaterialOcrService(repository, crashThenSucceed(repository, jobIds));

    await assert.rejects(service.process("mat_ocr"), /worker crashed/u);

    repository.failReads = false;
    const retried = await service.process("mat_ocr");
    assert.equal(retried.text, "OCR text");
    assert.equal(jobIds.length, 2);
    assert.notEqual(jobIds[0], jobIds[1]);
    assert.equal((await repository.get("mat_ocr"))?.lifecycleStatus, "ready");

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("OCR failure is still persisted before rejecting when the repository is healthy", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save(record());
  const service = new MaterialOcrService(repository, {
    process: async () => { throw new Error("worker crashed"); },
    cancel: async () => undefined,
    close: async () => undefined,
  });
  await assert.rejects(service.process("mat_ocr"), /worker crashed/u);
  const current = await repository.get("mat_ocr");
  assert.equal(current?.lifecycleStatus, "failed");
  assert.equal(current?.asset.processing.status, "failed");
  assert.equal(current?.lastError, "worker crashed");
});

test("markOcrFailed is best-effort and never throws when the repository read fails", async () => {
  const repository = new FlakyReadRepository("owner-a");
  await repository.save(record());
  repository.failReads = true;
  const current = record().asset.identity;
  const request: MaterialOcrRequest = {
    jobId: "ocr-mat_ocr-1-0", materialId: current.materialId, contentHash: current.contentHash,
    contentVersion: current.contentVersion, mediaKind: "png", generation: 1,
    bytes: Uint8Array.from([1, 2, 3]), deadlineAt: "2026-01-02T03:14:05.000Z",
  };
  await assert.doesNotReject(markOcrFailed(repository, "mat_ocr", request, new Error("worker crashed")));
});
