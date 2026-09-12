import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function renderer(path: string): Promise<string> {
  return readFile(new URL(`../src/desktop/renderer/src/${path}`, import.meta.url), "utf8");
}

test("[C3] DialogSelect uses themed listbox with teleport and keyboard support", async () => {
  const source = await renderer("components/DialogSelect.vue");
  assert.match(source, /<Teleport to="body">/u);
  assert.match(source, /role="listbox"/u);
  assert.match(source, /dialog-select-menu/u);
  assert.match(source, /onTriggerKeydown/u);
  assert.match(source, /onListKeydown/u);
  assert.match(source, /ArrowDown/u);
  assert.match(source, /aria-expanded/u);
});

test("[C3] DialogSelect anchors menu to viewport and avoids scroll clipping", async () => {
  const source = await renderer("composables/use-anchored-popover-position.ts");
  assert.match(source, /position:\s*"fixed"/u);
  assert.match(source, /addEventListener\("scroll"/u);
});

test("[C3] DialogSelect styles are loaded globally", async () => {
  const base = await renderer("styles/base.css");
  assert.match(base, /dialog-select\.css/u);
});
