import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  isWindowsTransientFsError,
  MATERIAL_RENAME_RETRY_DELAYS_MS,
  renameMaterialPath,
  type MaterialRenameDeps,
} from "../src/material/material-fs-retry.js";
import { readMaterialEncrypted, writeMaterialEncrypted } from "../src/material/material-repository-crypto.js";

const ZERO_DELAYS = [0, 0, 0, 0, 0, 0] as const;

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: operation failed, rename 'staging' -> 'generations'`), { code });
}

function scriptedRename(failures: readonly (string | undefined)[]): { calls: Array<[string, string]>; rename: MaterialRenameDeps["rename"] } {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    rename: async (from, to) => {
      const code = failures[calls.length];
      calls.push([from, to]);
      if (code) throw errno(code);
    },
  };
}

test("win32 EPERM from an AV/indexer handle is retried until the rename succeeds", async () => {
  const fake = scriptedRename(["EPERM", "EPERM"]);
  await renameMaterialPath("staging/gen-a", "generations/gen-a", { rename: fake.rename, platform: "win32", delays: ZERO_DELAYS });
  assert.equal(fake.calls.length, 3);
  assert.deepEqual(fake.calls.at(-1), ["staging/gen-a", "generations/gen-a"]);
});

test("win32 EACCES and EBUSY are retried like EPERM", async () => {
  const fake = scriptedRename(["EACCES", "EBUSY"]);
  await renameMaterialPath("a.tmp", "a", { rename: fake.rename, platform: "win32", delays: ZERO_DELAYS });
  assert.equal(fake.calls.length, 3);
});

test("a non-transient code such as ENOENT is rethrown after one call", async () => {
  const fake = scriptedRename(["ENOENT"]);
  await assert.rejects(
    renameMaterialPath("a.tmp", "a", { rename: fake.rename, platform: "win32", delays: ZERO_DELAYS }),
    (error: NodeJS.ErrnoException) => error.code === "ENOENT",
  );
  assert.equal(fake.calls.length, 1);
});

for (const platform of ["darwin", "linux"] as const) {
  test(`EPERM on ${platform} is a real permission failure and is rethrown after one call`, async () => {
    const fake = scriptedRename(["EPERM", "EPERM"]);
    await assert.rejects(
      renameMaterialPath("a.tmp", "a", { rename: fake.rename, platform, delays: ZERO_DELAYS }),
      (error: NodeJS.ErrnoException) => error.code === "EPERM",
    );
    assert.equal(fake.calls.length, 1);
  });
}

test("persistent win32 EBUSY is rethrown once the delays run out", async () => {
  const fake = scriptedRename(Array.from({ length: 20 }, () => "EBUSY"));
  await assert.rejects(
    renameMaterialPath("a.tmp", "a", { rename: fake.rename, platform: "win32", delays: ZERO_DELAYS }),
    (error: NodeJS.ErrnoException) => error.code === "EBUSY",
  );
  assert.equal(fake.calls.length, ZERO_DELAYS.length + 1);
});

test("default backoff stays near 1.5 s so other root-lock waiters (15 s timeout) are not starved", () => {
  const total = MATERIAL_RENAME_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);
  assert.ok(total >= 1_000 && total <= 2_000, `total backoff ${total} ms`);
  assert.equal(isWindowsTransientFsError(errno("EPERM"), "win32"), true);
  assert.equal(isWindowsTransientFsError(errno("EPERM"), "darwin"), false);
  assert.equal(isWindowsTransientFsError(undefined, "win32"), false);
});

test("writeMaterialEncrypted still replaces the target atomically through the retrying rename", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-rename-"));
  try {
    const key = randomBytes(32);
    const file = join(root, "commit.enc");
    await writeMaterialEncrypted(file, { generation: "gen-1" }, key, "commit");
    await writeMaterialEncrypted(file, { generation: "gen-2" }, key, "commit");
    assert.deepEqual(await readMaterialEncrypted(file, key, "commit"), { generation: "gen-2" });
    assert.deepEqual(await readdir(root), ["commit.enc"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
