import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  LocalDesktopIdentityStore,
  localDesktopIdentityPath,
} from "../src/desktop/main/local-desktop-identity-store.js";
import {
  LOCAL_DESKTOP_EMAIL,
  LOCAL_DESKTOP_ORIGIN,
  createLocalDesktopUser,
} from "../src/local-desktop.js";
import { canonicalApiOrigin } from "../src/privacy/export-canonical.js";

test("local desktop identity persists user and device ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-desktop-"));
  try {
    const path = localDesktopIdentityPath(root);
    const first = await new LocalDesktopIdentityStore(path).loadOrCreate();
    const second = await new LocalDesktopIdentityStore(path).loadOrCreate();
    assert.equal(first.userId, second.userId);
    assert.equal(first.deviceId, second.deviceId);
    const stored = JSON.parse(await readFile(path, "utf8")) as {
      userId: string;
      deviceId: string;
    };
    assert.equal(stored.userId, first.userId);
    const user = createLocalDesktopUser(first.userId, first.deviceId);
    assert.equal(user.email, LOCAL_DESKTOP_EMAIL);
    assert.equal(user.status, "active");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canonical origin accepts the local desktop scheme", () => {
  assert.equal(canonicalApiOrigin(LOCAL_DESKTOP_ORIGIN), "local://desktop");
  assert.throws(() => canonicalApiOrigin("local://other"), /导出 API 来源无效/);
});
