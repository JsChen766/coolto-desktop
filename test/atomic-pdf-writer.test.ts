import assert from "node:assert/strict";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import { atomicWritePdf } from "../src/desktop/main/atomic-pdf-writer.js";

test("atomic PDF writer writes a sibling temp file then renames it", async () => {
  const destination = join("tmp", "resume.pdf");
  let writtenPath: string | undefined;
  let renamed: readonly [string, string] | undefined;
  let removedPath: string | undefined;
  await atomicWritePdf(destination, new Uint8Array([1, 2]), {
    write: async (path) => { writtenPath = path; },
    rename: async (source, target) => { renamed = [source, target]; },
    remove: async (path) => { removedPath = path; },
  });
  assert.ok(writtenPath);
  assert.equal(dirname(writtenPath), dirname(destination));
  assert.match(basename(writtenPath), /^\.resume\.pdf\..+\.tmp$/u);
  assert.deepEqual(renamed, [writtenPath, destination]);
  assert.equal(removedPath, undefined);
});

test("atomic PDF writer cleans its temp file when rename fails", async () => {
  const destination = join("tmp", "resume.pdf");
  let writtenPath: string | undefined;
  let renameCalled = false;
  let removedPath: string | undefined;
  await assert.rejects(
    atomicWritePdf(destination, new Uint8Array([1]), {
      write: async (path) => { writtenPath = path; },
      rename: async () => { renameCalled = true; throw new Error("disk error"); },
      remove: async (path) => { removedPath = path; },
    }),
    /disk error/u,
  );
  assert.equal(renameCalled, true);
  assert.ok(writtenPath);
  assert.equal(removedPath, writtenPath);
});
