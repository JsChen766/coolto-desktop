import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ResumeDraftFileRepository } from "../src/desktop/main/resume-drafts/draft-file-repository.js";
import { canonicalApiOrigin } from "../src/privacy/export-canonical.js";
import { localScopeDigest, localScopeKey, syncScopeKey } from "../src/privacy/local-scope.js";

const codec = {
  encode: (value: string) => Buffer.from(value, "utf8"),
  decode: (value: Uint8Array) => Buffer.from(value).toString("utf8"),
};
const draft = {
  schemaVersion: "local-resume-draft-v1",
  artifactId: "00000000-0000-4000-8000-000000000001",
  ownerId: "owner-a",
  conversationIds: [], title: "Draft", createdAt: "2026-09-08T00:00:00Z",
  updatedAt: "2026-09-08T00:00:00Z", workspace: { revision: 1 }, checkpoints: [],
  pendingChange: null, cloudLink: null,
} as never;

test("local scope keys separate the same owner across API origins", () => {
  assert.notEqual(localScopeKey("https://api-a.example", "owner-a"), localScopeKey("https://api-b.example", "owner-a"));
  assert.notEqual(localScopeDigest("https://api-a.example", "owner-a"), localScopeDigest("https://api-b.example", "owner-a"));
});
test("same API origin keeps one local scope across base paths", () => {
  assert.equal(canonicalApiOrigin("https://api.example/v1/"), "https://api.example");
  assert.equal(localScopeKey("https://api.example/v1/", "owner-a"), localScopeKey("https://api.example", "owner-a"));
  assert.equal(syncScopeKey("https://api.example/v1/", "owner-a"), syncScopeKey("https://api.example", "owner-a"));
  assert.equal(localScopeDigest("https://api.example/v1/", "owner-a"), localScopeDigest("https://api.example", "owner-a"));
});

test("draft ciphertext copied across origins fails closed", async () => {
  const root = await mkdtemp(join(process.cwd(), "privacy-scope-"));
  try {
    const directory = join(root, "scoped");
    const a = new ResumeDraftFileRepository("owner-a", directory, codec, localScopeDigest("https://api-a.example", "owner-a"), join(root, "legacy"));
    await a.save(draft);
    const b = new ResumeDraftFileRepository("owner-a", directory, codec, localScopeDigest("https://api-b.example", "owner-a"), join(root, "legacy-b"));
    await assert.rejects(() => b.list(), /来源与当前 API 账号不匹配/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ambiguous owner-only legacy directories are rejected", async () => {
  const root = await mkdtemp(join(process.cwd(), "privacy-legacy-"));
  try {
    const legacy = join(root, "legacy");
    await mkdir(legacy, { recursive: true });
    const repo = new ResumeDraftFileRepository(
      "owner-a", join(root, "scoped"), codec,
      localScopeDigest("https://api-a.example", "owner-a"), legacy,
    );
    await assert.rejects(() => repo.list(), /未绑定 API 来源/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
