import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { EncryptedMaterialRepository, type MaterialStoredRecord } from "../src/material/material-repository.js";
import { materialOwnerRootLockPath } from "../src/material/material-root-lock.js";

function oldRecord(): MaterialStoredRecord {
  return {
    asset: {
      schema: "material.asset", version: 1,
      identity: { materialId: "mat_transaction", ownerId: "owner-a", contentHash: "e".repeat(64), contentVersion: 1 },
      metadata: { title: "Crash transaction", mediaKind: "text", sourceKind: "user_upload", sourceLabel: null, originalFilename: "transaction.txt", capturedAt: "2026-01-02T03:04:05.000Z" },
      processing: { status: "completed", ocr: null },
    },
    lifecycleStatus: "ready", classification: "unclassified", bytes: Buffer.alloc(24 * 1024 * 1024, 0x45),
    parsedText: "old generation only", parsedChunks: [], ocrText: null, ocrSegments: [], relations: [], lastError: null,
  };
}
async function waitForStagedBody(ownerRoot: string): Promise<boolean> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const generations = await readdir(join(ownerRoot, "staging")).catch(() => [] as string[]);
    for (const generation of generations) {
      try {
        if ((await stat(join(ownerRoot, "staging", generation, "records", "mat_transaction.enc"))).isFile()) return true;
      } catch { /* generation is still being created */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
}
function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () => resolve());
  });
}

test("child kill during a generation write reopens exactly the old committed state", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-crash-"));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const key = randomBytes(32);
    const repository = new EncryptedMaterialRepository(root, "owner-a", key);
    await repository.save(oldRecord());
    const ownerRoot = join(root, Buffer.from("owner-a").toString("base64url"));
    child = spawn(process.execPath, ["--import", "tsx", join(process.cwd(), "test", "support", "material-repository-crash-child.ts"), root, key.toString("base64")], {
      stdio: "ignore", windowsHide: true,
    });
    assert.equal(await waitForStagedBody(ownerRoot), true, "child never reached staged-generation body write");
    assert.equal(child.exitCode, null, "child completed before the crash boundary");
    const reopened = new EncryptedMaterialRepository(root, "owner-a", key);
    let reopenedSettled = false;
    const restoredPromise = reopened.get("mat_transaction").finally(() => { reopenedSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(reopenedSettled, false, "a live child root lock must block reopen cleanup");
    assert.equal(child.kill(), true, "could not terminate crash child");
    await waitForExit(child);

    const restored = await restoredPromise;
    assert.equal(restored?.classification, "unclassified");
    assert.equal(restored?.parsedText, "old generation only");
    assert.equal(restored?.relations.length, 0);
    assert.deepEqual(await readdir(join(ownerRoot, "staging")), []);
    await assert.rejects(stat(materialOwnerRootLockPath(ownerRoot)), { code: "ENOENT" }, "dead child marker was not reclaimed");
  } finally {
    if (child?.exitCode === null && child.signalCode === null) { child.kill(); await waitForExit(child).catch(() => undefined); }
    await rm(root, { recursive: true, force: true });
  }
});
