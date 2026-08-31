import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Agent Inspector motion stays bounded and respects reduced motion", async () => {
  const source = await readFile(new URL(
    "../src/desktop/renderer/src/browser-shell/BrowserAgentInspector.vue",
    import.meta.url,
  ), "utf8");
  assert.match(source, /presentation-open[^}]*inspector-enter var\(--motion-panel\)/su);
  assert.match(source, /presentation-closing[^}]*inspector-exit 160ms/su);
  assert.match(source, /translateY\(-4px\) scale\(\.992\)/u);
  assert.match(source, /prefers-reduced-motion: no-preference/u);
  assert.doesNotMatch(source, /bounce|elastic/iu);
});
