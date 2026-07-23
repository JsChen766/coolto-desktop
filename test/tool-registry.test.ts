import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "../src/tools/registry.js";

test("tool registry has unique, explicitly scoped tools", async () => {
  const tools = createToolRegistry();
  const names = tools.map((tool) => tool.name);

  assert.deepEqual(names, ["get_runtime_info"]);
  assert.equal(new Set(names).size, names.length);

  const runtimeTool = tools[0];
  assert.ok(runtimeTool);
  const result = await runtimeTool.execute("test-call", {});

  assert.equal(result.details.runtime, "local-pi-agent");
  assert.equal(result.details.architecture, "single-agent");
  assert.equal(result.details.cloudLangGraphUsed, false);
  assert.equal(result.details.persistentAssetCacheEnabled, false);
});
