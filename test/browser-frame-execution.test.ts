import assert from "node:assert/strict";
import test from "node:test";

import { executeInSameOriginFrames } from "../src/desktop/main/browser/browser-frame-execution.js";

test("frame execution includes same-origin OOPIFs and excludes cross-origin frames", async () => {
  const calls: string[] = [];
  const frame = (id: number, origin: string) => ({
    origin, frameTreeNodeId: id, isDestroyed: () => false,
    executeJavaScript: async () => { calls.push(`${origin}#${id}`); return id; },
  });
  const main = frame(1, "https://outlook.live.com") as ReturnType<typeof frame> & {
    framesInSubtree: unknown[];
  };
  const same = frame(2, "https://outlook.live.com");
  const cross = frame(3, "https://login.live.com");
  main.framesInSubtree = [main, same, cross];
  const results = await executeInSameOriginFrames<number>({ mainFrame: main } as never, "1");
  assert.deepEqual(results.map((item) => item.value), [1, 2]);
  assert.deepEqual(results[0]?.framePath, []);
  assert.deepEqual(results[1]?.framePath, ["https://outlook.live.com#2"]);
  assert.deepEqual(calls, ["https://outlook.live.com#1", "https://outlook.live.com#2"]);
});
