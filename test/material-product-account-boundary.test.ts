import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SelectedFileRegistry } from "../src/files/selected-file-registry.js";
import { RegistryMaterialFileBoundary } from "../src/material/material-file-boundary.js";

 test("material account scopes remain separate at repository root", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-scope-"));
  try {
    const a = new SelectedFileRegistry();
    const b = new SelectedFileRegistry();
    assert.notEqual(a, b);
    assert.deepEqual(a.list(), []);
    assert.deepEqual(b.list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("conversation registry rejects image while material boundary accepts it", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-file-"));
  const path = join(root, "scan.png");
  try {
    await writeFile(path, Buffer.from([137, 80, 78, 71]));
    const registry = new SelectedFileRegistry();
    await assert.rejects(registry.registerPaths([path]), /仅支持 PDF/u);
    const boundary = new RegistryMaterialFileBoundary(registry);
    const files = await boundary.registerPaths([path]);
    assert.equal(files[0]?.type, "png");
    const content = await boundary.read(files[0]!.id);
    assert.equal(content.metadata.type, "png");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
