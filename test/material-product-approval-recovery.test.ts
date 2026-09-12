import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { materialOwnerRootLockPath } from "../src/material/material-root-lock.js";
import { MaterialProposalService, type MaterialRelationCommitPort } from "../src/material/material-proposal-service.js";
import { EncryptedMaterialRepository, MemoryMaterialRepository, type MaterialStoredRecord } from "../src/material/material-repository.js";

async function cleanupDurableRoot(repositoryRoot: string): Promise<void> {
  await rm(materialOwnerRootLockPath(repositoryRoot), { recursive: true, force: true }).catch(() => undefined);
  await rm(repositoryRoot, { recursive: true, force: true });
}

function record(): MaterialStoredRecord {
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId: "mat_approval", ownerId: "owner-a", contentHash: "d".repeat(64), contentVersion: 1 },
      metadata: { title: "审批材料", mediaKind: "text", sourceKind: "user_upload", sourceLabel: null, originalFilename: "approval.txt", capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready", bytes: Buffer.from("private approval evidence"), parsedText: "private approval evidence", parsedChunks: [],
    ocrText: null, ocrSegments: [], relations: [], lastError: null,
  };
}
function citation() {
  return {
    schema: "material.citation", version: 1, ownerId: "owner-a", materialId: "mat_approval", materialHash: "d".repeat(64), materialVersion: 1,
    location: { kind: "page", page: 1, sectionLabel: "Results" },
  };
}
function host(overrides: Partial<MaterialRelationCommitPort> = {}): MaterialRelationCommitPort {
  return {
    prepare: async ({ experienceId }) => ({ proposalId: `host-${experienceId}`, experienceId }),
    executeMany: async () => [],
    ...overrides,
  };
}

test("concurrent approvals consume one live proposal before any host await", async () => {
  const repository = new MemoryMaterialRepository("owner-a");
  await repository.save(record());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let prepared = 0;
  let executed = 0;
  const idempotencyKeys: string[] = [];
  const service = new MaterialProposalService(repository, host({
    prepare: async ({ experienceId, idempotencyKey }) => { prepared += 1; idempotencyKeys.push(idempotencyKey); await gate; return { proposalId: `host-${experienceId}`, experienceId }; },
    executeMany: async () => { executed += 1; return []; },
  }));
  const proposal = await service.prepare("mat_approval", { classification: "classified", experienceReferences: [{ experienceId: "experience-a", citations: [citation()] }] });
  const first = service.approve(proposal.proposal.proposalId);
  const second = service.approve(proposal.proposal.proposalId);
  for (let index = 0; index < 20 && prepared === 0; index += 1) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(prepared, 1);
  release();
  assert.equal((await first).status, "approved");
  assert.equal((await second).status, "approved");
  assert.equal(executed, 1);
  assert.deepEqual(idempotencyKeys, [`${proposal.proposal.proposalId}:0`]);
});

interface DurableFixture { root: string; key: Buffer; repository: EncryptedMaterialRepository; proposalId: string; }
async function durableFixture(): Promise<DurableFixture> {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-approval-"));
  const key = randomBytes(32);
  const repository = new EncryptedMaterialRepository(root, "owner-a", key);
  await repository.save(record());
  const proposal = await new MaterialProposalService(repository).prepare("mat_approval", {
    classification: "classified", experienceReferences: [{ experienceId: "experience-a", citations: [citation()] }],
  });
  return { root, key, repository, proposalId: proposal.proposal.proposalId };
}
async function markMaterialSaved(fixture: DurableFixture): Promise<void> {
  const entry = await fixture.repository.proposalJournal().get(fixture.proposalId);
  assert.ok(entry);
  const prepared = [{ proposalId: "host-experience-a", experienceId: "experience-a", idempotencyKey: `${fixture.proposalId}:0` }];
  await fixture.repository.proposalJournal().claim(fixture.proposalId);
  await fixture.repository.proposalJournal().setPrepared(fixture.proposalId, prepared);
  await fixture.repository.proposalJournal().setMaterialSaving(fixture.proposalId);
  await fixture.repository.compareAndSave(entry.proposal.materialId, entry.proposal.materialHash, (current) => ({
    ...current,
    classification: entry.proposal.classification,
    relations: [...current.relations, {
      relationId: "mat-rel-recovery", experienceId: "experience-a", citations: entry.proposal.experienceReferences[0]!.citations, createdAt: entry.proposal.preparedAt,
    }],
  }));
  await fixture.repository.proposalJournal().setMaterialSaved(fixture.proposalId);
  await fixture.repository.proposalJournal().setExecuting(fixture.proposalId);
}

test("crash before prepare resets the durable claim without a host write", async () => {
  const fixture = await durableFixture();
  try {
    await fixture.repository.proposalJournal().claim(fixture.proposalId);
    let prepared = 0;
    let executed = 0;
    const reopened = new EncryptedMaterialRepository(fixture.root, "owner-a", fixture.key);
    const recovered = new MaterialProposalService(reopened, host({
      prepare: async () => { prepared += 1; return { proposalId: "unexpected" }; },
      executeMany: async () => { executed += 1; return []; },
    }));
    assert.equal((await recovered.recover(fixture.proposalId)).status, "pending");
    assert.equal(prepared, 0);
    assert.equal(executed, 0);
  } finally { await cleanupDurableRoot(fixture.root); }
});

test("crash after prepare and before execute discards prepared work without executing it", async () => {
  const fixture = await durableFixture();
  try {
    const prepared = [{ proposalId: "host-experience-a", experienceId: "experience-a", idempotencyKey: `${fixture.proposalId}:0` }];
    await fixture.repository.proposalJournal().claim(fixture.proposalId);
    await fixture.repository.proposalJournal().setPrepared(fixture.proposalId, prepared);
    const discarded: string[] = [];
    let executed = 0;
    const reopened = new EncryptedMaterialRepository(fixture.root, "owner-a", fixture.key);
    const recovered = new MaterialProposalService(reopened, host({
      discard: (proposalId) => discarded.push(proposalId),
      executeMany: async () => { executed += 1; return []; },
    }));
    assert.equal((await recovered.recover(fixture.proposalId)).status, "pending");
    assert.deepEqual(discarded, ["host-experience-a"]);
    assert.equal(executed, 0);
  } finally { await cleanupDurableRoot(fixture.root); }
});

test("execution uncertainty reconciles receipts and never silently repeats an external batch", async () => {
  const executedFixture = await durableFixture();
  try {
    await markMaterialSaved(executedFixture);
    let calls = 0;
    const reopened = new EncryptedMaterialRepository(executedFixture.root, "owner-a", executedFixture.key);
    const recovered = new MaterialProposalService(reopened, host({
      reconcileMany: async () => "executed",
      executeMany: async () => { calls += 1; return []; },
    }));
    assert.equal((await recovered.recover(executedFixture.proposalId)).status, "approved");
    assert.equal(calls, 0);
  } finally { await cleanupDurableRoot(executedFixture.root); }

  const notExecutedFixture = await durableFixture();
  try {
    await markMaterialSaved(notExecutedFixture);
    const batches: string[][] = [];
    let reconciles = 0;
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const reopened = new EncryptedMaterialRepository(notExecutedFixture.root, "owner-a", notExecutedFixture.key);
    const secondRepository = new EncryptedMaterialRepository(notExecutedFixture.root, "owner-a", notExecutedFixture.key);
    const sharedHost = host({
      reconcileMany: async () => { reconciles += 1; await wait; return "not_executed"; },
      executeMany: async (ids) => { batches.push([...ids]); return []; },
    });
    const recovered = new MaterialProposalService(reopened, sharedHost);
    const secondService = new MaterialProposalService(secondRepository, sharedHost);
    const first = recovered.recover(notExecutedFixture.proposalId);
    const second = secondService.recover(notExecutedFixture.proposalId);
    const deadline = Date.now() + 10_000;
    while (reconciles < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(reconciles, 2);
    release();
    assert.equal((await first).status, "pending");
    assert.equal((await second).status, "pending");
    assert.deepEqual(batches, []);
    assert.equal((await reopened.get("mat_approval"))?.relations.length, 0);
    assert.equal((await recovered.approve(notExecutedFixture.proposalId)).status, "approved");
    assert.deepEqual(batches, [["host-experience-a"]]);
  } finally { await cleanupDurableRoot(notExecutedFixture.root); }

  const unknownFixture = await durableFixture();
  try {
    await markMaterialSaved(unknownFixture);
    let calls = 0;
    const reopened = new EncryptedMaterialRepository(unknownFixture.root, "owner-a", unknownFixture.key);
    const recovered = new MaterialProposalService(reopened, host({
      reconcileMany: async () => "unknown",
      executeMany: async () => { calls += 1; return []; },
    }));
    assert.equal((await recovered.recover(unknownFixture.proposalId)).status, "needs_user_decision");
    assert.equal(calls, 0);
    assert.equal((await reopened.proposalJournal().get(unknownFixture.proposalId))?.status, "needs_user_decision");
  } finally { await cleanupDurableRoot(unknownFixture.root); }

  const noReceiptFixture = await durableFixture();
  try {
    await markMaterialSaved(noReceiptFixture);
    let calls = 0;
    const reopened = new EncryptedMaterialRepository(noReceiptFixture.root, "owner-a", noReceiptFixture.key);
    const recovered = new MaterialProposalService(reopened, host({ executeMany: async () => { calls += 1; return []; } }));
    assert.equal((await recovered.recover(noReceiptFixture.proposalId)).status, "needs_user_decision");
    assert.equal(calls, 0);
  } finally { await cleanupDurableRoot(noReceiptFixture.root); }
});
