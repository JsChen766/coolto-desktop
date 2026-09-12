import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  assertOwnedPrivacyPath,
  deletionPhaseRestrictsOrdinaryAccess,
  hashOwner,
  isValidDeletionRecoveryRecord,
  recoveryOwnerFromFilename,
  validateDeletionRecoveryDiscovery,
} from "../src/desktop/main/privacy/deletion-recovery-validation.js";

const apiBaseUrl = "http://localhost:8000";
const ownerId = "user-a";
const ownerHash = hashOwner(apiBaseUrl, ownerId);
const record = {
  version: 1 as const,
  apiBaseUrl,
  ownerId,
  accountEmail: "a@example.com",
  ownerHash,
  phase: "confirmed" as const,
  requestId: "request-1",
  startIdempotencyKey: "s".repeat(32),
  confirmationDigest: "d".repeat(64),
  controlToken: "t".repeat(32),
  ackIdempotencyKey: "a".repeat(32),
  localWipeComplete: false,
};

test("recovery validation binds schema, prototype, API, owner digest, and ciphertext record fields", () => {
  assert.equal(isValidDeletionRecoveryRecord(record, apiBaseUrl, ownerHash), true);
  assert.equal(isValidDeletionRecoveryRecord({ ...record, ownerId: "user-b" }, apiBaseUrl, ownerHash), false);
  assert.equal(isValidDeletionRecoveryRecord({ ...record, apiBaseUrl: "http://other" }, apiBaseUrl, ownerHash), false);
  assert.equal(isValidDeletionRecoveryRecord({ ...record, controlToken: "short" }, apiBaseUrl, ownerHash), false);
  const nullPrototype = Object.assign(Object.create(null), record);
  assert.equal(isValidDeletionRecoveryRecord(nullPrototype, apiBaseUrl, ownerHash), false);
  assert.equal(isValidDeletionRecoveryRecord({ ...record, version: 2 }, apiBaseUrl, ownerHash), false);
  assert.equal(recoveryOwnerFromFilename(`deletion-${ownerHash}.coolto`), ownerHash);
  assert.equal(isValidDeletionRecoveryRecord({ ...record, accountEmail: "A@EXAMPLE.COM" }, apiBaseUrl, ownerHash), false);
  assert.equal(isValidDeletionRecoveryRecord({ ...record, accountEmail: "" }, apiBaseUrl, ownerHash), false);
  assert.equal(recoveryOwnerFromFilename("deletion-../../outside.coolto"), undefined);
});
test("discovery validation throws tampered current-owner filenames and skips foreign self-bound records", () => {
  const foreignApiBaseUrl = "https://foreign.example";
  const foreignOwnerHash = hashOwner(foreignApiBaseUrl, ownerId);
  const foreignRecord = {
    ...record,
    apiBaseUrl: foreignApiBaseUrl,
    ownerHash: foreignOwnerHash,
  };
  assert.equal(
    validateDeletionRecoveryDiscovery(
      foreignRecord,
      foreignApiBaseUrl,
      apiBaseUrl,
      foreignOwnerHash,
    ),
    false,
  );
  assert.throws(
    () => validateDeletionRecoveryDiscovery(
      { ...record, apiBaseUrl: foreignApiBaseUrl },
      foreignApiBaseUrl,
      apiBaseUrl,
      ownerHash,
    ),
    /删除恢复记录校验失败/u,
  );
});
test("confirm-sent and confirmed phases restrict ordinary access, awaiting-saved does not", () => {
  assert.equal(deletionPhaseRestrictsOrdinaryAccess("awaiting_saved"), false);
  assert.equal(deletionPhaseRestrictsOrdinaryAccess("confirm_sent"), true);
  assert.equal(deletionPhaseRestrictsOrdinaryAccess("confirmed"), true);
});

test("recovery paths stay inside the exact privacy root", () => {
  const root = join("coolto", "privacy");
  assert.doesNotThrow(() => assertOwnedPrivacyPath(root, join(root, `deletion-${ownerHash}.coolto`)));
  assert.throws(() => assertOwnedPrivacyPath(root, join(root, "..", "outside.coolto")), /应用隐私目录/u);
  assert.throws(() => assertOwnedPrivacyPath(root, root), /应用隐私目录/u);
});
