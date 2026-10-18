import assert from "node:assert/strict";
import test from "node:test";

import { MaterialContractError } from "../src/material/material-types.js";
import { MaterialDeleteImpactService } from "../src/material/material-delete-impact.js";
import { MaterialImportService } from "../src/material/material-import-service.js";
import { MaterialOcrService, type MaterialOcrWorkerPort } from "../src/material/material-ocr-service.js";
import {
  MemoryMaterialRepository,
  type MaterialOcrSegmentRecord,
  type MaterialStoredRecord,
} from "../src/material/material-repository.js";
import { MaterialViewService } from "../src/material/material-view.js";
import type { MaterialFileBoundary } from "../src/material/material-file-boundary.js";
import type { MaterialSelectedFileContent } from "../src/files/types.js";
import { hashMaterialBytes } from "../src/material/material-identity.js";

/**
 * Open-source PRD §10 本机材料库 — acceptance contract.
 * 验收：上传可见处理状态；材料↔Experience 关联可查 + 删除前影响说明；
 * OCR 低置信须确认；原样投递件未经授权不解析入库。
 */

function boundary(content: MaterialSelectedFileContent): MaterialFileBoundary {
  return {
    registerPaths: async () => [content.metadata],
    list: () => [content.metadata],
    read: async () => ({ metadata: { ...content.metadata }, content: Buffer.from(content.content) }),
    remove: () => undefined,
    clear: () => undefined,
  };
}

function textParsed() {
  return {
    fileId: "attachment-1",
    filename: "notes.txt",
    text: "project alpha shipped",
    charCount: 21,
    truncated: false,
    requiresOcr: false,
    ocrPages: [] as number[],
    chunks: [{ id: "chunk-1", index: 0, label: "正文", text: "project alpha shipped" }],
  };
}

function imageParsed() {
  return {
    fileId: "attachment-image",
    filename: "scan.png",
    text: "",
    charCount: 0,
    truncated: false,
    requiresOcr: true,
    ocrPages: [1],
    chunks: [] as Array<{ id: string; index: number; label: string; text: string }>,
  };
}

test("§10 upload supported text/image and expose processing status via MaterialView", async () => {
  const textContent: MaterialSelectedFileContent = {
    metadata: { id: "attachment-1", filename: "notes.txt", type: "text", sizeBytes: 21 },
    content: Buffer.from("project alpha shipped"),
  };
  const imageContent: MaterialSelectedFileContent = {
    metadata: { id: "attachment-image", filename: "scan.png", type: "png", sizeBytes: 3 },
    content: Buffer.from([1, 2, 3]),
  };
  const repository = new MemoryMaterialRepository("owner-a");
  const textImporter = new MaterialImportService(boundary(textContent), repository, {
    parse: async () => textParsed(),
  });
  const imageImporter = new MaterialImportService(boundary(imageContent), repository, {
    parse: async () => imageParsed(),
  });
  const textResult = await textImporter.import({ fileId: "attachment-1", ownerId: "owner-a" });
  const imageResult = await imageImporter.import({ fileId: "attachment-image", ownerId: "owner-a" });
  const views = new MaterialViewService(repository);
  const textView = await views.get(textResult.record.asset.identity.materialId);
  const imageView = await views.get(imageResult.record.asset.identity.materialId);
  assert.equal(textView?.status, "unclassified");
  assert.equal(textView?.processingStatus, "completed");
  assert.equal(textView?.classification, "unclassified");
  assert.equal(imageView?.status, "queued");
  assert.equal(imageView?.processingStatus, "unprocessed");
  assert.equal(imageView?.mediaKind, "png");
});

test("§10 material↔Experience relations are queryable and delete previews impact", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  const record: MaterialStoredRecord = {
    asset: {
      schema: "material.asset",
      version: 1,
      identity: {
        materialId: "mat_rel",
        ownerId: "owner-a",
        contentHash: "a".repeat(64),
        contentVersion: 1,
      },
      metadata: {
        title: "证据",
        mediaKind: "text",
        sourceKind: "user_upload",
        sourceLabel: null,
        originalFilename: "facts.txt",
        capturedAt: "2026-01-02T03:04:05.000Z",
      },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready",
    classification: "classified",
    bytes: Buffer.from("bytes"),
    parsedText: "text",
    parsedChunks: [],
    ocrText: null,
    ocrSegments: [],
    relations: [
      {
        relationId: "relation-1",
        experienceId: "experience-b",
        citations: [{ location: { kind: "page", page: 1 } }],
        createdAt: "2026-01-02T03:04:05.000Z",
      },
      {
        relationId: "relation-2",
        experienceId: "experience-a",
        citations: [
          { location: { kind: "page", page: 2 } },
          { location: { kind: "page", page: 3 } },
        ],
        createdAt: "2026-01-02T03:04:06.000Z",
      },
    ],
    lastError: null,
  };
  await repository.save(record);
  const view = await new MaterialViewService(repository).get("mat_rel");
  assert.deepEqual(view?.relatedExperienceIds, ["experience-a", "experience-b"]);
  assert.equal(view?.relationCount, 2);
  assert.equal(view?.citationCount, 3);
  const impact = await new MaterialDeleteImpactService(repository).preview("mat_rel");
  assert.deepEqual(impact.affectedExperiences, [
    { experienceId: "experience-a", citationCount: 2 },
    { experienceId: "experience-b", citationCount: 1 },
  ]);
  assert.equal(impact.publishedAssetsPreserved, true);
  assert.ok(impact.confirmationToken.startsWith("mat-delete-"));
});

test("§10 low-confidence OCR stays needs_confirmation until user confirms", async () => {
  const bytes = Buffer.from([9, 8, 7]);
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save({
    asset: {
      schema: "material.asset",
      version: 1,
      identity: {
        materialId: "mat_ocr_low",
        ownerId: "owner-a",
        contentHash: hashMaterialBytes(bytes),
        contentVersion: 1,
      },
      metadata: {
        title: "扫描件",
        mediaKind: "png",
        sourceKind: "user_upload",
        sourceLabel: null,
        originalFilename: "scan.png",
        capturedAt: "2026-01-02T03:04:05.000Z",
      },
      processing: { status: "unprocessed", ocr: null },
    },
    lifecycleStatus: "queued",
    bytes,
    parsedText: null,
    parsedChunks: [],
    ocrText: null,
    ocrSegments: [],
    relations: [],
    lastError: null,
  });
  const segment: MaterialOcrSegmentRecord = {
    segmentId: "ocr-1",
    text: "blurry",
    confidence: 0.41,
    page: 1,
    bbox: { x: 1, y: 2, width: 3, height: 4 },
  };
  const worker: MaterialOcrWorkerPort = {
    process: async () => ({
      text: "blurry",
      overallConfidence: 0.41,
      segments: [segment],
      engine: { name: "test-local", version: "1" },
    }),
    cancel: async () => undefined,
    close: async () => undefined,
  };
  const service = new MaterialOcrService(repository, worker);
  await service.process("mat_ocr_low");
  const after = await new MaterialViewService(repository).get("mat_ocr_low");
  assert.equal(after?.status, "needs_confirmation");
  assert.equal(after?.needsUserConfirmation, true);
  assert.equal(after?.ocrConfidence, 0.41);
});

test("§10 delivery_resume without materialIntent refuses before parse (no inventory write)", async () => {
  const content: MaterialSelectedFileContent = {
    metadata: { id: "attachment-delivery", filename: "resume.pdf", type: "pdf", sizeBytes: 4 },
    content: Buffer.from("%PDF"),
  };
  const repository = new MemoryMaterialRepository("owner-a");
  let parseCalls = 0;
  const importer = new MaterialImportService(boundary(content), repository, {
    parse: async () => {
      parseCalls += 1;
      return textParsed();
    },
  });
  await assert.rejects(
    () => importer.import({
      fileId: "attachment-delivery",
      ownerId: "owner-a",
      sourceKind: "delivery_resume",
    }),
    (error: unknown) => {
      assert.ok(error instanceof MaterialContractError);
      assert.equal(error.code, "not_material_authorized");
      return true;
    },
  );
  assert.equal(parseCalls, 0);
  assert.equal((await repository.list()).length, 0);

  const authorized = await importer.import({
    fileId: "attachment-delivery",
    ownerId: "owner-a",
    sourceKind: "delivery_resume",
    authorization: { sourceKind: "delivery_resume", materialIntent: true },
  });
  assert.equal(parseCalls, 1);
  assert.equal(authorized.duplicate, false);
  assert.equal(authorized.record.asset.metadata.sourceKind, "delivery_resume");
  assert.equal(authorized.record.classification, "unclassified");
});
