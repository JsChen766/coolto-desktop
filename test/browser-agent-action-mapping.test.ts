import assert from "node:assert/strict";
import test from "node:test";

import { browserAgentActionForTool } from
  "../src/browser/browser-agent-action-mapping.js";

test("browser action mapping exposes semantic kinds without raw tool details", () => {
  assert.deepEqual(browserAgentActionForTool("browser_snapshot"),
    { impact: "read", kind: "observe" });
  assert.deepEqual(browserAgentActionForTool("browser_navigate"),
    { impact: "page_change", kind: "navigate" });
  assert.deepEqual(browserAgentActionForTool("browser_fill_field"),
    { impact: "page_change", kind: "fill" });
  assert.deepEqual(browserAgentActionForTool("browser_submit"),
    { impact: "external_commitment", kind: "submit" });
  assert.deepEqual(browserAgentActionForTool("unknown_internal_tool"),
    { impact: "read", kind: "other" });
});
