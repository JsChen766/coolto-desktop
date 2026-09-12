import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SelectedFileRegistry } from "../src/files/selected-file-registry.js";
import { RegistryMaterialFileBoundary, assertOpaqueMaterialFileId } from "../src/material/material-file-boundary.js";

test("material file boundary returns opaque IDs and copies bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-material-boundary-"));
  try {
    const path = join(root, "evidence.txt");
    await writeFile(path, "private evidence", "utf8");
    const boundary = new RegistryMaterialFileBoundary(new SelectedFileRegistry());
    const [metadata] = await boundary.registerPaths([path]);
    assert.ok(metadata?.id.startsWith("attachment-"));
    assertOpaqueMaterialFileId(metadata!.id);
    const first = await boundary.read(metadata!.id);
    first.content[0] = 0;
    const second = await boundary.read(metadata!.id);
    assert.equal(second.content.toString("utf8"), "private evidence");
    assert.throws(() => assertOpaqueMaterialFileId("C:\\secret.txt"), /明确选择/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
