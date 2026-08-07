import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  downloadUpdateFile,
  resolveUpdateUrl,
  selectZipFile,
} from "../src/desktop/main/update/update-downloader.js";
import type { UpdateFileInfo } from "../src/desktop/main/update/update-downloader.js";

test("selectZipFile picks the zip entry", () => {
  const files: UpdateFileInfo[] = [
    { url: "Coolto-0.2.0.zip.blockmap" },
    { url: "Coolto-0.2.0.zip", sha512: "abc", size: 10 },
    { url: "Coolto-0.2.0.dmg" },
  ];
  const selected = selectZipFile(files);
  assert.equal(selected.url, "Coolto-0.2.0.zip");
});

test("selectZipFile rejects feeds without a zip", () => {
  assert.throws(
    () => selectZipFile([{ url: "Coolto-0.2.0.dmg" }]),
    /没有可用的 zip/,
  );
});

test("resolveUpdateUrl joins relative and keeps absolute urls", () => {
  const feed = "http://127.0.0.1:8099";
  assert.equal(
    resolveUpdateUrl("Coolto-0.2.0.zip", feed),
    "http://127.0.0.1:8099/Coolto-0.2.0.zip",
  );
  assert.equal(
    resolveUpdateUrl("/updates/Coolto-0.2.0.zip", feed),
    "http://127.0.0.1:8099/updates/Coolto-0.2.0.zip",
  );
  assert.equal(
    resolveUpdateUrl("https://example.com/x.zip", feed),
    "https://example.com/x.zip",
  );
});

test("downloadUpdateFile streams with progress and verifies sha512", async () => {
  const payload = createRandomBytes(256 * 1024);
  const expectedSha512 = createHash("sha512").update(payload).digest("base64");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Length": payload.byteLength });
    response.end(payload);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/Coolto-0.2.0.zip`;

  const dir = await mkdtemp(join(tmpdir(), "update-dl-"));
  const target = join(dir, "update.zip");
  const progress: number[] = [];
  try {
    const result = await downloadUpdateFile({
      files: [{ url, sha512: expectedSha512, size: payload.byteLength }],
      feedUrl: "http://127.0.0.1:1",
      targetPath: target,
      onProgress: (p) => progress.push(p.percent),
    });
    assert.equal(result.sha512, expectedSha512);
    assert.equal(result.bytes, payload.byteLength);
    assert.equal((await readFile(target)).byteLength, payload.byteLength);
    assert.ok(
      progress.length > 1 && progress.at(-1) === 100,
      "progress should reach 100%",
    );
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("downloadUpdateFile rejects on sha512 mismatch and cleans up", async () => {
  const payload = createRandomBytes(1024);
  const server = createServer((_request, response) => {
    response.end(payload);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const dir = await mkdtemp(join(tmpdir(), "update-dl-"));
  const target = join(dir, "update.zip");
  try {
    await assert.rejects(
      downloadUpdateFile({
        files: [{ url: `http://127.0.0.1:${address.port}/x.zip`, sha512: "wrong" }],
        feedUrl: "http://127.0.0.1:1",
        targetPath: target,
      }),
      /SHA-512 不匹配/,
    );
    await assert.rejects(readFile(target), "partial file must be removed");
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

function createRandomBytes(size: number): Buffer {
  const buffer = Buffer.allocUnsafe(size);
  for (let offset = 0; offset < size; offset += 64) {
    const chunk = Buffer.from(
      String(Math.random()).padEnd(64, "x"),
    );
    chunk.copy(buffer, offset);
  }
  return buffer;
}
