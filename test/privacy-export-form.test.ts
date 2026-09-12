import assert from "node:assert/strict";
import test from "node:test";

import { submitPrivacyExport } from "../src/desktop/renderer/src/privacy/privacy-export-form.js";

const options = {
  includeCloudAssets: true,
  includeConversations: false,
  includeDrafts: false,
  includeTasks: false,
};

test("export form resets before awaiting and returns no credential fields", async () => {
  const events: string[] = [];
  let resolveExport!: (value: { status: "exported"; fileName: string; mode: "synchronized" }) => void;
  const exportPromise = new Promise<{ status: "exported"; fileName: string; mode: "synchronized" }>((resolve) => {
    resolveExport = resolve;
  });
  const pending = submitPrivacyExport({
    values: { passphrase: "correct horse", confirmation: "correct horse" },
    options,
    reset: () => events.push("reset"),
    exportData: async (input) => {
      events.push(input.passphrase === "correct horse" ? "export" : "wrong");
      return exportPromise;
    },
  });
  await Promise.resolve();
  assert.deepEqual(events, ["reset", "export"]);
  resolveExport({ status: "exported", fileName: "coolto-export.json", mode: "synchronized" });
  const result = await pending;
  assert.deepEqual(result, {
    status: "exported",
    fileName: "coolto-export.json",
    mode: "synchronized",
  });
  assert.doesNotMatch(JSON.stringify(result), /correct horse/u);
});

test("export form redacts a backend error that echoes the passphrase", async () => {
  await assert.rejects(
    submitPrivacyExport({
      values: { passphrase: "correct horse", confirmation: "correct horse" },
      options,
      reset: () => undefined,
      exportData: async () => { throw new Error("backend echoed correct horse"); },
    }),
    (error: unknown) => error instanceof Error &&
      error.message === "导出失败，请重试" &&
      !error.message.includes("correct horse"),
  );
});
