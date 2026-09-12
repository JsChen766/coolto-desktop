import assert from "node:assert/strict";
import test from "node:test";

import { MaterialDeleteImpactService } from "../src/material/material-delete-impact.js";
import { MemoryMaterialRepository, type MaterialStoredRecord } from "../src/material/material-repository.js";

function record(): MaterialStoredRecord {
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId: "mat_delete", ownerId: "owner-a", contentHash: "d".repeat(64), contentVersion: 1 },
      metadata: { title: "待删除", mediaKind: "text", sourceKind: "user_upload", sourceLabel: null, originalFilename: "delete.txt", capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready", bytes: Buffer.from("bytes"), parsedText: "text", parsedChunks: [], ocrText: null, ocrSegments: [],
    relations: [{ relationId: "relation-1", experienceId: "experience-a", citations: [{ location: { kind: "page", page: 1 } }], createdAt: "2026-01-02T03:04:05.000Z" }],
    lastError: null,
  };
}

test("delete cancel is a no-op and preview lists affected citations", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save(record());
  const service = new MaterialDeleteImpactService(repository);
  const preview = await service.preview("mat_delete");
  assert.deepEqual(preview.affectedExperiences, [{ experienceId: "experience-a", citationCount: 1 }]);
  assert.equal(preview.publishedAssetsPreserved, true);
  service.cancel(preview.confirmationToken);
  assert.ok(await repository.get("mat_delete"));
});

test("confirmed delete removes only local material record", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save(record());
  const service = new MaterialDeleteImpactService(repository);
  const preview = await service.preview("mat_delete");
  await service.confirm(preview.confirmationToken);
  assert.equal(await repository.get("mat_delete"), undefined);
});

test("delete confirmation expires when its relation or classification impact changes", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  const initial = record();
  initial.classification = "unclassified";
  initial.relations = [];
  await repository.save(initial);
  const service = new MaterialDeleteImpactService(repository);
  const preview = await service.preview("mat_delete");

  await repository.update("mat_delete", (current) => ({
    ...current,
    classification: "classified",
    relations: [{
      relationId: "relation-new", experienceId: "experience-new",
      citations: [{ location: { kind: "page", page: 2 } }],
      createdAt: "2026-01-03T00:00:00.000Z",
    }],
  }));

  await assert.rejects(service.confirm(preview.confirmationToken), /重新查看删除影响/u);
  assert.equal((await repository.get("mat_delete"))?.relations[0]?.experienceId, "experience-new");
});
