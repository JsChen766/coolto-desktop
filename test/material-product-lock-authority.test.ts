import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MaterialProposalService } from "../src/material/material-proposal-service.js";
import { EncryptedMaterialRepository, type MaterialStoredRecord } from "../src/material/material-repository.js";
import { materialOwnerRootLockPath, withMaterialRootLock } from "../src/material/material-root-lock.js";

const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

function record(): MaterialStoredRecord {
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId: "mat_lock_authority", ownerId: "owner-a", contentHash: "f".repeat(64), contentVersion: 1 },
      metadata: { title: "Lock authority", mediaKind: "text", sourceKind: "user_upload", sourceLabel: null, originalFilename: "lock.txt", capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready", bytes: Buffer.from("lock authority"), parsedText: "lock authority", parsedChunks: [],
    ocrText: null, ocrSegments: [], relations: [], lastError: null,
  };
}
function citation() {
  return {
    schema: "material.citation" as const, version: 1 as const, ownerId: "owner-a", materialId: "mat_lock_authority", materialHash: "f".repeat(64), materialVersion: 1,
    location: { kind: "page" as const, page: 1, sectionLabel: "Results" },
  };
}

test("journal mutation and generation clear use the same owner-root sibling lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-lock-authority-"));
  const ownerRoot = join(root, Buffer.from("owner-a").toString("base64url"));
  const lock = materialOwnerRootLockPath(ownerRoot);
  const repository = new EncryptedMaterialRepository(root, "owner-a", randomBytes(32));
  try {
    await repository.save(record());
    const proposal = await new MaterialProposalService(repository).prepare("mat_lock_authority", {
      classification: "classified", experienceReferences: [{ experienceId: "experience-a", citations: [citation()] }],
    });

    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    const held = withMaterialRootLock(lock, async () => { entered(); await gate; });
    await acquired;
    let claimSettled = false;
    const claim = repository.proposalJournal().claim(proposal.proposal.proposalId).finally(() => { claimSettled = true; });
    await pause(40);
    assert.equal(claimSettled, false, "journal mutation bypassed generation root lock");
    release();
    await held;
    assert.equal((await claim).claimed, true);

    let releaseClear!: () => void;
    let enteredClear!: () => void;
    const clearGate = new Promise<void>((resolve) => { releaseClear = resolve; });
    const clearAcquired = new Promise<void>((resolve) => { enteredClear = resolve; });
    const clearHeld = withMaterialRootLock(lock, async () => { enteredClear(); await clearGate; });
    await clearAcquired;
    let clearSettled = false;
    const clear = repository.clear().finally(() => { clearSettled = true; });
    await pause(40);
    assert.equal(clearSettled, false, "generation clear bypassed journal root lock");
    releaseClear();
    await clearHeld;
    await clear;
    assert.deepEqual(await repository.list(), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
