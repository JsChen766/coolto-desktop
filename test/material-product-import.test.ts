import assert from "node:assert/strict";
import test from "node:test";

import type { MaterialFileBoundary } from "../src/material/material-file-boundary.js";
import { MaterialImportService } from "../src/material/material-import-service.js";
import { MemoryMaterialRepository } from "../src/material/material-repository.js";
import type { MaterialSelectedFileContent } from "../src/files/types.js";

function boundary(content: MaterialSelectedFileContent): MaterialFileBoundary {
  return {
    registerPaths: async () => [content.metadata],
    list: () => [content.metadata],
    read: async () => ({ metadata: { ...content.metadata }, content: Buffer.from(content.content) }),
    remove: () => undefined,
    clear: () => undefined,
  };
}

function parsed(requiresOcr: boolean) {
  return {
    fileId: "attachment-1", filename: "source.txt", text: requiresOcr ? "" : "hello",
    charCount: requiresOcr ? 0 : 5, truncated: false, requiresOcr, ocrPages: requiresOcr ? [1] : [],
    chunks: requiresOcr ? [] : [{ id: "chunk-1", index: 0, label: "正文", text: "hello" }],
  };
}

test("local text import stores parsed text and same bytes dedupe", async () => {
  const content: MaterialSelectedFileContent = {
    metadata: { id: "attachment-1", filename: "source.txt", type: "text", sizeBytes: 5 },
    content: Buffer.from("hello"),
  };
  const repository = new MemoryMaterialRepository("owner-a");
  const importer = new MaterialImportService(boundary(content), repository, { parse: async () => parsed(false) });
  const first = await importer.import({ fileId: content.metadata.id, ownerId: "owner-a" });
  const second = await importer.import({ fileId: content.metadata.id, ownerId: "owner-a" });
  assert.equal(first.record.asset.metadata.mediaKind, "text");
  assert.equal(first.record.parsedText, "hello");
  assert.equal(second.duplicate, true);
  assert.equal((await repository.list()).length, 1);
});

test("image import remains queued for OCR and never uses conversation parser path", async () => {
  const content: MaterialSelectedFileContent = {
    metadata: { id: "attachment-image", filename: "scan.png", type: "png", sizeBytes: 3 },
    content: Buffer.from([1, 2, 3]),
  };
  const repository = new MemoryMaterialRepository("owner-a");
  const importer = new MaterialImportService(boundary(content), repository, { parse: async () => parsed(true) });
  const result = await importer.import({ fileId: content.metadata.id, ownerId: "owner-a" });
  assert.equal(result.record.asset.metadata.mediaKind, "png");
  assert.equal(result.record.lifecycleStatus, "queued");
  assert.equal(result.record.parsedText, null);
});
