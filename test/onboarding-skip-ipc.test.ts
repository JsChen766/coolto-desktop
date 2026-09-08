import assert from "node:assert/strict";
import test from "node:test";

import { registerOnboardingIpc } from
  "../src/desktop/main/onboarding/onboarding-ipc.js";

test("skip cleans the Browser demo before completing onboarding", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const calls: string[] = [];
  registerOnboardingIpc({
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
  } as never, async () => ({
    onboardingBrowser: {
      cleanup: async () => { calls.push("cleanup"); },
    },
    onboarding: {
      skip: async () => {
        calls.push("skip");
        return {
          status: { version: 1, state: "completed", step: "completed",
            conversationId: null, completedAt: "2026-09-08T00:00:00.000Z" },
          conversation: null,
        };
      },
    },
  } as never));

  const result = await handlers.get("onboarding:skip")?.({});
  assert.deepEqual(calls, ["cleanup", "skip"]);
  assert.equal((result as { status: { state: string } }).status.state, "completed");
});
