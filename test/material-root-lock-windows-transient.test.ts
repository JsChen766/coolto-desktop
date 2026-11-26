import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { isTransientLockError, withMaterialRootLock } from "../src/material/material-root-lock.js";

const errno = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code });

test("Windows delete-pending errors count as lock contention only on win32", () => {
  for (const code of ["EPERM", "EACCES", "EBUSY"]) {
    assert.equal(isTransientLockError(errno(code), "win32"), true, `${code} on win32`);
    assert.equal(isTransientLockError(errno(code), "darwin"), false, `${code} on darwin stays fatal`);
    assert.equal(isTransientLockError(errno(code), "linux"), false, `${code} on linux stays fatal`);
  }
  assert.equal(isTransientLockError(errno("EEXIST"), "win32"), false);
  assert.equal(isTransientLockError(errno("ENOENT"), "win32"), false);
  assert.equal(isTransientLockError(undefined, "win32"), false);
});

test("heavy same-process contention never surfaces EPERM and stays mutually exclusive", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-lock-contention-"));
  const lock = join(root, ".root.material.lock");
  let active = 0;
  let maxActive = 0;
  let completed = 0;
  try {
    await Promise.all(Array.from({ length: 12 }, async () => {
      for (let round = 0; round < 20; round += 1) {
        await withMaterialRootLock(lock, async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setImmediate(resolve));
          active -= 1;
          completed += 1;
        }, 30_000);
      }
    }));
    assert.equal(maxActive, 1);
    assert.equal(completed, 240);
    await assert.rejects(stat(lock), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
});
