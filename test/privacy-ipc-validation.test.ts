import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePrivacyDeletionInput,
  parsePrivacyExportOptions,
  requirePrivacyFeature,
} from "../src/desktop/main/privacy/privacy-ipc.js";

const validExport = {
  includeCloudAssets: true,
  includeConversations: false,
  includeDrafts: false,
  includeTasks: false,
  passphrase: "one-shot passphrase",
};

const validDeletion = {
  accountEmail: "alice@example.com",
  confirmation: "DELETE MY ACCOUNT",
};

test("privacy IPC accepts only fresh plain export payloads", () => {
  const parsed = parsePrivacyExportOptions(validExport);
  assert.deepEqual(parsed, validExport);
  assert.notEqual(parsed, validExport);
  assert.throws(() => parsePrivacyExportOptions(null), /无效/u);
  assert.throws(() => parsePrivacyExportOptions([]), /无效/u);
  assert.throws(() => parsePrivacyExportOptions(Object.create(null)), /无效/u);
  const inherited = Object.create({ includeCloudAssets: true });
  Object.assign(inherited, {
    includeConversations: false,
    includeDrafts: false,
    includeTasks: false,
    passphrase: "one-shot passphrase",
  });
  assert.throws(() => parsePrivacyExportOptions(inherited), /无效/u);
  assert.throws(() => parsePrivacyExportOptions({ ...validExport, token: "secret" }), /未支持字段/u);
  assert.throws(() => parsePrivacyExportOptions({ ...validExport, passphrase: "short" }), /无效/u);
});

test("privacy IPC accepts only exact deletion fields", () => {
  assert.deepEqual(parsePrivacyDeletionInput(validDeletion), validDeletion);
  assert.throws(() => parsePrivacyDeletionInput(null), /无效/u);
  assert.throws(() => parsePrivacyDeletionInput(Object.create(null)), /无效/u);
  assert.throws(() => parsePrivacyDeletionInput({ ...validDeletion, token: "secret" }), /未支持字段/u);
  assert.throws(() => parsePrivacyDeletionInput(Object.assign(Object.create({ accountEmail: "alice@example.com" }), { confirmation: "DELETE MY ACCOUNT" })), /无效/u);
});
test("offline cached consent cannot open cloud deletion transport", async () => {
  const auth = {
    privacy: {
      isOfflineLocalOnly: true,
      isFeatureAvailable: true,
    },
  };
  let recoveryChecked = false;
  await assert.rejects(
    requirePrivacyFeature(
      auth as never,
      async () => { recoveryChecked = true; return false; },
    ),
    /本机读取或导出/u,
  );
  assert.equal(recoveryChecked, false);
});
