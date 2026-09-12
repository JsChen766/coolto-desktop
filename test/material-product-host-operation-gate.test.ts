import assert from "node:assert/strict";
import test from "node:test";

import type { MaterialFileBoundary } from "../src/material/material-file-boundary.js";
import { createMaterialHostPort, type MaterialHostDependencies, type MaterialHostPort, type MaterialPrepareRelationInput } from "../src/material/material-host-contract.js";
import { MaterialHostOperationGate } from "../src/material/material-host-operation-gate.js";
import { MaterialDeleteImpactService } from "../src/material/material-delete-impact.js";
import { MaterialExportService } from "../src/material/material-export.js";
import { MaterialImportService } from "../src/material/material-import-service.js";
import { MaterialOcrService, type MaterialOcrWorkerPort } from "../src/material/material-ocr-service.js";
import { MaterialProposalService } from "../src/material/material-proposal-service.js";
import { MemoryMaterialRepository, type MaterialStoredRecord } from "../src/material/material-repository.js";
import { MaterialViewService } from "../src/material/material-view.js";

interface Deferred<T> { promise: Promise<T>; resolve(value: T | PromiseLike<T>): void; }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

class DeferredRepository extends MemoryMaterialRepository {
  public readonly getStarted = deferred<void>();
  public readonly releaseGet = deferred<void>();
  public clearCount = 0;
  #deferNextGet = true;

  public override async get(materialId: string): Promise<MaterialStoredRecord | undefined> {
    if (this.#deferNextGet) {
      this.#deferNextGet = false;
      this.getStarted.resolve();
      await this.releaseGet.promise;
    }
    return super.get(materialId);
  }

  public override async clear(): Promise<void> {
    this.clearCount += 1;
    await super.clear();
  }
}

class CountingRepository extends MemoryMaterialRepository {
  public clearCount = 0;
  public override async clear(): Promise<void> {
    this.clearCount += 1;
    await super.clear();
  }
}

interface HostFixture {
  dependencies: MaterialHostDependencies;
  proposals: MaterialProposalService;
  fileClears(): number;
  ocrCloses(): number;
}

function fixture(repository: MemoryMaterialRepository): HostFixture {
  let fileClearCount = 0;
  let ocrCloseCount = 0;
  const files: MaterialFileBoundary = {
    registerPaths: async () => [],
    list: () => [],
    read: async () => { throw new Error("test file boundary should not read"); },
    remove: () => undefined,
    clear: () => { fileClearCount += 1; },
  };
  const worker: MaterialOcrWorkerPort = {
    process: async () => { throw new Error("test OCR worker should not process"); },
    cancel: async () => undefined,
    close: async () => { ocrCloseCount += 1; },
  };
  const proposals = new MaterialProposalService(repository);
  return {
    dependencies: {
      ownerId: "owner-a", repository, files,
      importer: new MaterialImportService(files, repository),
      ocr: new MaterialOcrService(repository, worker), proposals,
      views: new MaterialViewService(repository),
      deleteImpact: new MaterialDeleteImpactService(repository),
      exports: new MaterialExportService(repository),
    },
    proposals,
    fileClears: () => fileClearCount,
    ocrCloses: () => ocrCloseCount,
  };
}

function record(): MaterialStoredRecord {
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId: "mat_approval", ownerId: "owner-a", contentHash: "d".repeat(64), contentVersion: 1 },
      metadata: { title: "审批材料", mediaKind: "text", sourceKind: "user_upload", sourceLabel: null, originalFilename: "approval.txt", capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready", classification: "unclassified", bytes: Buffer.from("private approval evidence"),
    parsedText: "private approval evidence", parsedChunks: [], ocrText: null, ocrSegments: [], relations: [], lastError: null,
  };
}

function relationInput(): MaterialPrepareRelationInput {
  return {
    materialId: "mat_approval", classification: "classified",
    experienceReferences: [{ experienceId: "experience-a", citations: [{
      schema: "material.citation", version: 1, ownerId: "owner-a", materialId: "mat_approval", materialHash: "d".repeat(64), materialVersion: 1,
      location: { kind: "page", page: 1, sectionLabel: "Results" },
    }] }],
  };
}

test("an injected owner gate makes clear wait for prepare before removing its durable and live proposal", async () => {
  const repository = new DeferredRepository("owner-a");
  await repository.save(record());
  const services = fixture(repository);
  const gate = new MaterialHostOperationGate();
  const preparing = createMaterialHostPort({ ...services.dependencies, operationGate: gate });
  const clearing = createMaterialHostPort({ ...services.dependencies, operationGate: gate });
  const prepare = preparing.materialTools.prepareRelation(relationInput());
  await repository.getStarted.promise;
  const clear = clearing.clearLocalData();
  let settled = false;
  void clear.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, "clear must wait for an admitted prepare");
  await assert.rejects(preparing.materialCatalog.get("mat_approval"), /材料服务正在关闭/);
  await assert.rejects(preparing.rejectRelation("mat-proposal-late"), /材料服务正在关闭/);
  await assert.rejects(preparing.cancelDelete("mat-delete-late"), /材料服务正在关闭/);
  await assert.rejects(preparing.materialFileBoundary.registerPaths(["C:\\test.txt"]), /材料服务正在关闭/);
  assert.throws(() => preparing.materialFileBoundary.list(), /材料服务正在关闭/);
  assert.throws(() => preparing.materialFileBoundary.remove("attachment-late"), /材料服务正在关闭/);
  repository.releaseGet.resolve();
  const prepared = await prepare;
  await clear;
  assert.equal(await repository.get("mat_approval"), undefined);
  assert.equal(await repository.proposalJournal().get(prepared.proposal.proposalId), undefined);
  assert.equal(services.proposals.get(prepared.proposal.proposalId), undefined);
  assert.equal(repository.clearCount, 1);
  assert.equal(services.fileClears(), 1);
  assert.equal(services.ocrCloses(), 1);
});

test("clear and close are idempotent in either concurrent order", async () => {
  for (const first of ["clear", "close"] as const) {
    const repository = new CountingRepository("owner-a");
    await repository.save(record());
    const services = fixture(repository);
    const host: MaterialHostPort = createMaterialHostPort(services.dependencies);
    const proposal = await host.materialTools.prepareRelation(relationInput());
    const firstOperation = first === "clear" ? host.clearLocalData() : host.close();
    const clear = host.clearLocalData();
    const close = host.close();
    if (first === "clear") assert.equal(firstOperation, clear, "duplicate clear reuses its promise");
    await Promise.all([firstOperation, clear, close]);
    assert.equal(await repository.get("mat_approval"), undefined, `${first} must not skip data removal`);
    assert.equal(await repository.proposalJournal().get(proposal.proposal.proposalId), undefined);
    assert.equal(services.proposals.get(proposal.proposal.proposalId), undefined);
    assert.equal(repository.clearCount, 1);
    assert.equal(services.fileClears(), 1);
    assert.equal(services.ocrCloses(), 1, `${first} shares one OCR close`);
  }
});
