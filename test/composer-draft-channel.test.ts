import assert from "node:assert/strict";
import test from "node:test";

import {
  publishComposerDraft,
  subscribeComposerDraft,
} from "../src/desktop/renderer/src/chat/composer-draft-channel.js";

test("composer draft channel fills only active subscribers", () => {
  const received: string[] = [];
  const unsubscribe = subscribeComposerDraft((text) => received.push(text));

  publishComposerDraft("粘贴经历链接：");
  unsubscribe();
  publishComposerDraft("不应继续接收");

  assert.deepEqual(received, ["粘贴经历链接："]);
});
