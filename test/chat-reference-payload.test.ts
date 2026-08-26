import assert from "node:assert/strict";
import test from "node:test";
import { reactive } from "vue";

import { plainResumeChatReference } from
  "../src/desktop/renderer/src/chat/chat-reference-payload.js";

test("resume reference payload strips Vue proxies before Electron IPC", () => {
  const reference = reactive({
    artifactId: "artifact-1",
    targetType: "resume" as const,
    targetId: "artifact-1",
    label: "投资者关系实习生",
    source: "local" as const,
  });

  const payload = plainResumeChatReference(reference);

  assert.notEqual(payload, reference);
  assert.doesNotThrow(() => structuredClone(payload));
  assert.deepEqual(payload, {
    artifactId: "artifact-1",
    targetType: "resume",
    targetId: "artifact-1",
    label: "投资者关系实习生",
    source: "local",
  });
});
