import assert from "node:assert/strict";
import test from "node:test";

import { registerJobAssetIpc } from "../src/desktop/main/job-assets/job-asset-ipc.js";

test("job-assets:get delegates to the current user's read service", async () => {
  let channel = "";
  let handler: (() => Promise<unknown>) | undefined;
  const expected = { jds: [], resumes: [], deliveryResumeFiles: [] };
  const ipcMain = {
    handle(name: string, callback: () => Promise<unknown>) {
      channel = name;
      handler = callback;
    },
  };
  registerJobAssetIpc(ipcMain as never, async () => ({
    get: async () => expected,
  }) as never);

  assert.equal(channel, "job-assets:get");
  assert.deepEqual(await handler?.(), expected);
});
