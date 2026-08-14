import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { FileSessionStore } from "../src/auth/file-session-store.js";

import type { StoredAuthSession } from "../src/auth/session-store.js";

function validSession(): StoredAuthSession {
  return {
    version: 1,
    apiBaseUrl: "https://hkapi.coolto.com.cn",
    accessToken: "abc123.xyz",
  };
}

test("FileSessionStore: missing file loads as no session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "session-store-"));
  const store = new FileSessionStore(join(dir, "missing.json"));
  assert.equal(await store.load(), undefined);
});

test("FileSessionStore: loads a valid session file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "session-store-"));
  const path = join(dir, "session.json");
  await writeFile(path, JSON.stringify(validSession()));
  const store = new FileSessionStore(path);
  const loaded = await store.load();
  assert.ok(loaded);
  assert.equal(loaded.apiBaseUrl, "https://hkapi.coolto.com.cn");
  assert.equal(loaded.accessToken, "abc123.xyz");
});

test("FileSessionStore: invalid content loads as no session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "session-store-"));
  const path = join(dir, "session.json");
  await writeFile(path, "not json {");
  const store = new FileSessionStore(path);
  assert.equal(await store.load(), undefined);
});

test("FileSessionStore: save then load round-trips", async () => {
  const dir = await mkdtemp(join(tmpdir(), "session-store-"));
  const path = join(dir, "session.json");
  const store = new FileSessionStore(path);
  await store.save(validSession());
  const loaded = await store.load();
  assert.ok(loaded);
  assert.equal(loaded.accessToken, "abc123.xyz");
  const raw = await readFile(path, "utf8");
  assert.ok(raw.length > 0, "session file should be written");
});

test("FileSessionStore: clear removes the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "session-store-"));
  const path = join(dir, "session.json");
  const store = new FileSessionStore(path);
  await store.save(validSession());
  await store.clear();
  assert.equal(await store.load(), undefined);
});
