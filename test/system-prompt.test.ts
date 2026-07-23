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
  assert.match(COOLTO_SYSTEM_PROMPT, /nextCursor/);
  assert.match(COOLTO_SYSTEM_PROMPT, /覆盖全部经历/);
  assert.match(COOLTO_SYSTEM_PROMPT, /不得自行生成待决策卡片/);
  assert.match(COOLTO_SYSTEM_PROMPT, /接受、拒绝、自定义回答/);
  assert.match(SYSTEM_PROMPT_VERSION, /^coolto-local-agent\/v\d+$/);
});
