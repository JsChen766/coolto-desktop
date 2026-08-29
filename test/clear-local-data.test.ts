import assert from "node:assert/strict";
import test from "node:test";

import { clearLocalData } from "../src/desktop/main/clear-local-data.js";

test("clearing local data includes immutable user delivery files", async () => {
  const calls: string[] = [];
  await clearLocalData({
    conversations: { clearAll: async () => { calls.push("conversations"); } },
    resumeDrafts: { clearAll: async () => { calls.push("drafts"); } },
    agentHarness: { clearAll: async () => { calls.push("harness"); } },
    mailConnections: { clearAll: async () => { calls.push("mail"); } },
    deliveryResumeFiles: { clearAll: async () => { calls.push("delivery-files"); } },
    selectedFiles: { clear: () => { calls.push("attachments"); } },
    syncStore: { purgeLocal: () => { calls.push("sync"); } },
  } as never);

  assert.deepEqual(calls, [
    "conversations",
    "drafts",
    "harness",
    "mail",
    "delivery-files",
    "attachments",
    "sync",
  ]);
});
