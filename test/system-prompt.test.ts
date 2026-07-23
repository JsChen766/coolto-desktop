import assert from "node:assert/strict";
import test from "node:test";

import {
  COOLTO_SYSTEM_PROMPT,
  SYSTEM_PROMPT_VERSION,
} from "../src/agent/system-prompt.js";

test("system prompt defines autonomous tool choice and clarification behavior", () => {
  assert.match(COOLTO_SYSTEM_PROMPT, /自然语言意图/);
  assert.match(COOLTO_SYSTEM_PROMPT, /选择最合适的工具/);
  assert.match(COOLTO_SYSTEM_PROMPT, /不确定性/);
  assert.match(COOLTO_SYSTEM_PROMPT, /追问/);
  assert.match(COOLTO_SYSTEM_PROMPT, /不得编造/);
  assert.match(SYSTEM_PROMPT_VERSION, /^coolto-local-agent\/v\d+$/);
});
