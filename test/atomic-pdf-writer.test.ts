import assert from "node:assert/strict";
import test from "node:test";

import { atomicWritePdf } from "../src/desktop/main/atomic-pdf-writer.js";

test("atomic PDF writer writes a sibling temp file then renames it", async () => {
  const calls: string[] = [];
  await atomicWritePdf("/tmp/resume.pdf", new Uint8Array([1, 2]), {
    write: async (path) => { calls.push(`write:${path}`); },
    rename: async (source, target) => { calls.push(`rename:${source}:${target}`); },
    remove: async (path) => { calls.push(`remove:${path}`); },
  });
  assert.match(calls[0]!, /^write:\/tmp\/\.resume\.pdf\..+\.tmp$/u);
  assert.match(calls[1]!, /^rename:\/tmp\/\.resume\.pdf\..+\.tmp:\/tmp\/resume\.pdf$/u);
  assert.equal(calls.length, 2);
});

test("atomic PDF writer cleans its temp file when rename fails", async () => {
  const calls: string[] = [];
  await assert.rejects(
    atomicWritePdf("/tmp/resume.pdf", new Uint8Array([1]), {
      write: async (path) => { calls.push(`write:${path}`); },
      rename: async () => { calls.push("rename"); throw new Error("disk error"); },
      remove: async (path) => { calls.push(`remove:${path}`); },
    }),
    /disk error/u,
  );
  assert.equal(calls[1], "rename");
  assert.match(calls[2]!, /^remove:\/tmp\/\.resume\.pdf\..+\.tmp$/u);
});
