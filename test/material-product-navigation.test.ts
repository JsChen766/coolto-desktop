import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileTemplate, parse } from "@vue/compiler-sfc";

async function compileTemplateFile(path: string): Promise<string> {
  const source = await readFile(path, "utf8");
  const parsed = parse(source, { filename: path });
  assert.equal(parsed.errors.length, 0);
  const compiled = compileTemplate({ id: path, source: parsed.descriptor.template?.content ?? "", filename: path });
  assert.deepEqual(compiled.errors, []);
  return compiled.code;
}

test("material library component and workspace branch compile as reachable views", async () => {
  const library = await compileTemplateFile("src/desktop/renderer/src/material/MaterialLibraryView.vue");
  const workspace = await compileTemplateFile("src/desktop/renderer/src/app/AppMainWorkspace.vue");
  assert.match(library, /material-library-view/u);
  assert.match(workspace, /activeView === 'material'/u);
});

test("material library submits its query to the host rather than filtering catalog metadata locally", async () => {
  const source = await readFile("src/desktop/renderer/src/material/MaterialLibraryView.vue", "utf8");
  assert.match(source, /options\.query = normalizedQuery/u);
  assert.match(source, /api\.value\.list\(options\)/u);
  assert.doesNotMatch(source, /const filtered = computed/u);
});

test("material relation recovery state remains visible and cannot repeat a host write", async () => {
  const source = await readFile("src/desktop/renderer/src/material/MaterialRelationProposal.vue", "utf8");
  assert.match(source, /needs_user_decision/u);
  assert.match(source, /busy \|\| !canDecide/u);
});
