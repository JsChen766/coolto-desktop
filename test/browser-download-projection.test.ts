import assert from "node:assert/strict";
import test from "node:test";

import { BrowserDownloadProjectionStore } from
  "../src/browser/browser-download-projection.js";

test("download projection exposes only sanitized UI facts", () => {
  const store = new BrowserDownloadProjectionStore();
  store.start({
    id: "download-1",
    filename: "C:\\private\\report.txt",
    sourceUrl: "https://user:secret@example.com/files/report.txt?token=private",
    receivedBytes: -1,
    totalBytes: Number.NaN,
    startedAt: "2026-08-31T01:00:00.000Z",
  });
  assert.deepEqual(store.snapshot(), [{
    id: "download-1",
    filename: "report.txt",
    sourceOrigin: "https://example.com",
    status: "progressing",
    receivedBytes: 0,
    totalBytes: 0,
    startedAt: "2026-08-31T01:00:00.000Z",
    updatedAt: "2026-08-31T01:00:00.000Z",
  }]);
  assert.doesNotMatch(JSON.stringify(store.snapshot()), /secret|token=private/u);
});

test("download projection keeps concurrent progress and terminal states isolated", () => {
  const store = new BrowserDownloadProjectionStore();
  for (const [id, time] of [["first", "01:00"], ["second", "01:01"]] as const) {
    store.start({
      id, filename: "same.txt", sourceUrl: "https://files.example/download",
      receivedBytes: 0, totalBytes: 100,
      startedAt: `2026-08-31T${time}:00.000Z`,
    });
  }
  store.update("first", "completed", 100, 100, "2026-08-31T01:02:00.000Z");
  store.update("second", "cancelled", 30, 100, "2026-08-31T01:03:00.000Z");
  assert.deepEqual(store.snapshot().map((item) => [item.id, item.status]), [
    ["second", "cancelled"], ["first", "completed"],
  ]);
  const copy = store.snapshot();
  copy[0]!.filename = "mutated";
  assert.equal(store.snapshot()[0]?.filename, "same.txt");
  assert.equal(store.dismiss("second"), true);
  assert.deepEqual(store.snapshot().map((item) => item.id), ["first"]);
});
