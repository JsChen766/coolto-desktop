import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Experience editor hides temporal fields for professional skills", async () => {
  const source = await readFile(new URL(
    "../src/desktop/renderer/src/components/ExperienceEditor.vue",
    import.meta.url,
  ), "utf8");
  assert.match(source, /EXPERIENCE_KIND_LABELS/u);
  assert.match(source, /v-if="kind !== 'skills'"[\s\S]*?<ExperienceDateFields/u);
});

test("the Experience detail omits an empty skills date row", async () => {
  const source = await readFile(new URL(
    "../src/desktop/renderer/src/components/ExperienceDetail.vue",
    import.meta.url,
  ), "utf8");
  assert.match(source, /const dateRange = computed/u);
  assert.match(source, /<div v-if="dateRange">[\s\S]*?\$t\('时间'\)/u);
});
