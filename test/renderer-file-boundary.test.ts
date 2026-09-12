import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { DesktopApi } from "../src/desktop/shared/types.js";
import { createOnboardingSampleRuntime } from
  "../src/desktop/renderer/src/onboarding/onboarding-sample-api.js";
import { ATTACHMENT_IPC_CHANNELS } from
  "../src/desktop/main/attachments/host-file-reference.js";
import { ConversationSelectedFiles } from "../src/desktop/main/conversation-selected-files.js";

test("Renderer-facing attachment API exposes only host-owned selection", () => {
  const api = createOnboardingSampleRuntime({
    attachments: {
      list: async () => [],
      select: async () => undefined,
      selectFile: async () => undefined,
      remove: async () => undefined,
    },
  } as unknown as DesktopApi, "welcome").api;
  assert.equal("getPathForFile" in api, false);
  assert.equal("selectPath" in api.attachments, false);
  assert.equal(typeof api.attachments.selectFile, "function");
});

test("Attachment IPC uses host capture instead of path channel", () => {
  const channels: readonly string[] = ATTACHMENT_IPC_CHANNELS;
  assert.equal(channels.includes("attachments:select-path"), false);
  assert.equal(channels.includes("attachments:capture-file"), true);
});
test("Host capture retains bytes after the source path disappears", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-file-boundary-"));
  try {
    const path = join(directory, "resume.txt");
    await writeFile(path, "immutable selected bytes", "utf8");
    const selectedFiles = new ConversationSelectedFiles();
    const metadata = await selectedFiles.replace("conversation-1", path);
    assert.equal("path" in metadata, false);
    await rm(path);
    const selected = await selectedFiles.forConversation("conversation-1").read(metadata.id);
    assert.equal(Buffer.from(selected.content).toString("utf8"), "immutable selected bytes");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
