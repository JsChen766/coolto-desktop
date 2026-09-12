import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, rmdir, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MATERIAL_ROOT_LOCK_STALE_MS,
  materialRootLockMarkerPath,
  reclaimMaterialRootLock,
  releaseMaterialRootLock,
  withMaterialRootLock,
} from "../src/material/material-root-lock.js";

const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
const entry = (token: string, pid = 731): string => JSON.stringify({ pid, token, acquiredAt: "2026-01-02T03:04:05.000Z" });

async function waitForFile(file: string, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await stat(file).then(() => true).catch(() => false)) return true;
    await pause(5);
  }
  return false;
}
function waitForExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}

test("root lock fails closed for live holders and bounds malformed or empty recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-lock-"));
  const lock = join(root, "material.lock");
  const now = Date.now();
  const old = new Date(now - MATERIAL_ROOT_LOCK_STALE_MS - 1);
  try {
    const liveToken = randomUUID();
    const liveMarker = materialRootLockMarkerPath(lock, liveToken);
    await mkdir(lock);
    await writeFile(liveMarker, entry(liveToken), "utf8");
    await utimes(lock, old, old);
    assert.equal(await reclaimMaterialRootLock(lock, now, () => true), false, "a live PID is never age-reclaimed");
    assert.equal(await readFile(liveMarker, "utf8"), entry(liveToken));
    assert.equal(await reclaimMaterialRootLock(lock, now, () => false), true, "a dead marker is reclaimed by its exact token path");
    await assert.rejects(stat(lock), { code: "ENOENT" });

    await mkdir(lock);
    await writeFile(join(lock, "malformed"), "not json", "utf8");
    assert.equal(await reclaimMaterialRootLock(lock, now, () => true), false, "recent malformed lock fails closed");
    await utimes(lock, old, old);
    assert.equal(await reclaimMaterialRootLock(lock, now, () => true), true, "stale malformed lock is boundedly reclaimed");
    await assert.rejects(stat(lock), { code: "ENOENT" });

    await mkdir(lock);
    assert.equal(await reclaimMaterialRootLock(lock, now, () => true), false, "recent empty directory is not reclaimed");
    await utimes(lock, old, old);
    assert.equal(await reclaimMaterialRootLock(lock, now, () => true), true, "stale empty directory is removed only with rmdir");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("same-process contenders enter one token-marked critical section at a time", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-lock-"));
  const lock = join(root, "material.lock");
  let active = 0;
  let maxActive = 0;
  try {
    await Promise.all(Array.from({ length: 6 }, () => withMaterialRootLock(lock, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await pause(25);
      active -= 1;
    })));
    assert.equal(maxActive, 1);
    await assert.rejects(stat(lock), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("old token cannot release a replacement marker after directory recreation", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-lock-"));
  const lock = join(root, "material.lock");
  const oldToken = randomUUID();
  const replacementToken = randomUUID();
  const replacement = entry(replacementToken, 732);
  try {
    await mkdir(lock);
    await writeFile(materialRootLockMarkerPath(lock, oldToken), entry(oldToken), "utf8");
    await unlink(materialRootLockMarkerPath(lock, oldToken));
    await rmdir(lock);
    await mkdir(lock);
    await writeFile(materialRootLockMarkerPath(lock, replacementToken), replacement, "utf8");
    await releaseMaterialRootLock(lock, oldToken);
    assert.equal(await readFile(materialRootLockMarkerPath(lock, replacementToken), "utf8"), replacement);
    await releaseMaterialRootLock(lock, replacementToken);
    await assert.rejects(stat(lock), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cross-process contenders remain mutually exclusive", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-lock-"));
  const lock = join(root, "material.lock");
  const activeRoot = join(root, "active");
  const script = join(process.cwd(), "test", "support", "material-root-lock-contender.ts");
  const children = Array.from({ length: 6 }, (_, index) => spawn(process.execPath, ["--import", "tsx", script, lock, activeRoot, String(index)], { stdio: "ignore", windowsHide: true }));
  let monitoring = true;
  let maxActive = 0;
  const monitor = (async () => {
    while (monitoring) {
      maxActive = Math.max(maxActive, (await readdir(activeRoot).catch(() => [] as string[])).length);
      await pause(2);
    }
  })();
  try {
    assert.deepEqual(await Promise.all(children.map(waitForExit)), Array.from({ length: 6 }, () => 0));
    assert.equal(maxActive, 1);
    await assert.rejects(stat(lock), { code: "ENOENT" }, "all contender markers must be released");
  } finally {
    monitoring = false;
    await monitor;
    for (const child of children) if (child.exitCode === null) child.kill();
    await rm(root, { recursive: true, force: true });
  }
});

test("six cross-process contenders safely reclaim a killed holder", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-lock-"));
  const lock = join(root, "material.lock");
  const activeRoot = join(root, "active");
  const ready = join(root, "dead-holder-ready");
  const holderScript = join(process.cwd(), "test", "support", "material-root-lock-dead-holder.ts");
  const contenderScript = join(process.cwd(), "test", "support", "material-root-lock-contender.ts");
  let holder: ReturnType<typeof spawn> | undefined;
  const contenders: ReturnType<typeof spawn>[] = [];
  let monitoring = true;
  let maxActive = 0;
  const monitor = (async () => {
    while (monitoring) {
      maxActive = Math.max(maxActive, (await readdir(activeRoot).catch(() => [] as string[])).length);
      await pause(2);
    }
  })();
  try {
    holder = spawn(process.execPath, ["--import", "tsx", holderScript, lock, ready], { stdio: "ignore", windowsHide: true });
    assert.equal(await waitForFile(ready), true, "holder did not publish its marker");
    assert.equal(holder.kill(), true, "could not terminate dead holder");
    await waitForExit(holder);
    for (let index = 0; index < 6; index += 1) contenders.push(spawn(process.execPath, ["--import", "tsx", contenderScript, lock, activeRoot, String(index)], { stdio: "ignore", windowsHide: true }));
    assert.deepEqual(await Promise.all(contenders.map(waitForExit)), Array.from({ length: 6 }, () => 0));
    assert.equal(maxActive, 1, "dead-holder recovery allowed concurrent critical sections");
    await assert.rejects(stat(lock), { code: "ENOENT" }, "reclaimed holder or contender marker remained");
  } finally {
    monitoring = false;
    await monitor;
    if (holder?.exitCode === null) holder.kill();
    for (const contender of contenders) if (contender.exitCode === null) contender.kill();
    await rm(root, { recursive: true, force: true });
  }
});

test("a cross-process old marker cannot rename a replacement after directory recreation", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-lock-"));
  const lock = join(root, "material.lock");
  const oldToken = randomUUID();
  const replacementToken = randomUUID();
  const ready = join(root, "old-owner-observed");
  const proceed = join(root, "recreate-complete");
  const script = join(process.cwd(), "test", "support", "material-root-lock-release-window.ts");
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await mkdir(lock);
    await writeFile(materialRootLockMarkerPath(lock, oldToken), entry(oldToken), "utf8");
    child = spawn(process.execPath, ["--import", "tsx", script, lock, oldToken, ready, proceed], { stdio: "ignore", windowsHide: true });
    assert.equal(await waitForFile(ready), true, "old process did not observe its exact marker");
    await unlink(materialRootLockMarkerPath(lock, oldToken));
    await rmdir(lock);
    await mkdir(lock);
    const replacement = entry(replacementToken, 732);
    await writeFile(materialRootLockMarkerPath(lock, replacementToken), replacement, "utf8");
    await writeFile(proceed, "go", "utf8");
    assert.equal(await waitForExit(child), 0);
    assert.equal(await readFile(materialRootLockMarkerPath(lock, replacementToken), "utf8"), replacement);
  } finally {
    if (child?.exitCode === null) child.kill();
    await rm(root, { recursive: true, force: true });
  }
});
