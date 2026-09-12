import assert from "node:assert/strict";
import test from "node:test";

import { MaterialProposalService } from "../src/material/material-proposal-service.js";
import { MemoryMaterialRepository, type MaterialStoredRecord } from "../src/material/material-repository.js";

function record(): MaterialStoredRecord {
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId: "mat_relation", ownerId: "owner-a", contentHash: "c".repeat(64), contentVersion: 1 },
      metadata: { title: "事实材料", mediaKind: "text", sourceKind: "user_upload", sourceLabel: null, originalFilename: "facts.txt", capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready", bytes: Buffer.from("private"), parsedText: "private evidence", parsedChunks: [],
    ocrText: null, ocrSegments: [], relations: [], lastError: null,
  };
}

function citation(page: number) {
  return {
    schema: "material.citation", version: 1, ownerId: "owner-a", materialId: "mat_relation",
    materialHash: "c".repeat(64), materialVersion: 1,
    location: { kind: "page", page, sectionLabel: "Results" },
  };
}

test("multi-Experience relation waits for approval and stores citations only", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save(record());
  const prepared: string[] = [];
  const executed: string[] = [];
  const service = new MaterialProposalService(repository, {
    prepare: async ({ experienceId }) => { const id = `experience-proposal-${experienceId}`; prepared.push(id); return { proposalId: id, experienceId: `canonical-${experienceId}` }; },
    executeMany: async (ids) => { executed.push(...ids); return ids.map(() => ({})); },
  });
  const proposal = await service.prepare("mat_relation", {
    classification: "classified",
    experienceReferences: [
      { experienceId: "experience-a", citations: [citation(1)] },
      { experienceId: "experience-b", citations: [citation(2)] },
    ],
  });
  assert.deepEqual((await repository.get("mat_relation"))?.relations, []);
  assert.equal((await repository.get("mat_relation"))?.classification, "unclassified");
  const approved = await service.approve(proposal.proposal.proposalId);
  assert.equal(approved.status, "approved");
  assert.deepEqual(prepared, ["experience-proposal-experience-a", "experience-proposal-experience-b"]);
  assert.deepEqual(executed, prepared);
  assert.deepEqual((await repository.get("mat_relation"))?.relations.map((relation) => relation.experienceId), ["canonical-experience-a", "canonical-experience-b"]);
  assert.equal((await repository.get("mat_relation"))?.classification, "classified");
});

test("an unreceipted host batch error preserves the recovery state instead of retrying or rolling back", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save(record());
  const discarded: string[] = [];
  const service = new MaterialProposalService(repository, {
    prepare: async ({ experienceId }) => ({ proposalId: `proposal-${experienceId}`, experienceId }),
    executeMany: async () => { throw new Error("atomic batch rejected"); },
    discard: (id) => discarded.push(id),
  });
  const proposal = await service.prepare("mat_relation", {
    classification: "classified",
    experienceReferences: [
      { experienceId: "experience-a", citations: [citation(1)] },
      { experienceId: "experience-b", citations: [citation(2)] },
    ],
  });
  assert.equal((await service.approve(proposal.proposal.proposalId)).status, "needs_user_decision");
  assert.deepEqual(discarded, []);
  assert.equal(service.get(proposal.proposal.proposalId)?.status, "needs_user_decision");
  assert.equal((await repository.get("mat_relation"))?.relations.length, 2);
});

test("duplicate citation fingerprints and unclassified targets fail closed", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save(record());
  const service = new MaterialProposalService(repository);
  await assert.rejects(service.prepare("mat_relation", {
    classification: "classified",
    experienceReferences: [
      { experienceId: "experience-a", citations: [citation(1)] },
      { experienceId: "experience-b", citations: [citation(1)] },
    ],
  }), /citation must be unique/u);
  await assert.rejects(service.prepare("mat_relation", {
    classification: "unclassified",
    experienceReferences: [{ experienceId: "experience-a", citations: [citation(2)] }],
  }), /unclassified/u);
});
