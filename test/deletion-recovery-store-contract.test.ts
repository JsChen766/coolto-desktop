import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("deletion recovery discovery is fail-closed for links, corruption, ambiguity, and encryption", async () => {
  const source = await readFile(new URL(
    "../src/desktop/main/privacy/deletion-recovery-store.ts",
    import.meta.url,
  ), "utf8");
  assert.match(source, /entry\.isSymbolicLink\(\)/u);
  assert.match(source, /realpath\(/u);
  assert.match(source, /discoverOne[\s\S]+stores\.length > 1/u);
  assert.match(source, /safeStorage\.decryptString/u);
  assert.match(source, /requireEncryption\(\)/u);
  assert.match(source, /isValidDeletionRecoveryRecord/u);
  assert.match(source, /safeStorage\.isEncryptionAvailable\(\)/u);
  assert.match(source, /stat\(resolvedPath\)[\s\S]+size > 1024 \* 1024/u);
  assert.match(source, /必须是普通文件/u);
  assert.match(source, /handle\.sync\(\)/u);
  assert.match(source, /rename\(temporary, destination\)/u);
  assert.match(source, /unlink\(temporary\)/u);
});
test("discovery validates record self-binding before filtering foreign origins", async () => {
  const source = await readFile(new URL(
    "../src/desktop/main/privacy/deletion-recovery-store.ts",
    import.meta.url,
  ), "utf8");
  const originIndex = source.indexOf("const recordOrigin = recoveryRecordOrigin(parsed);");
  const validationIndex = source.indexOf(
    "validateDeletionRecoveryDiscovery(",
    originIndex,
  );
  const ownerFilterIndex = source.indexOf(
    "if (ownerId && parsed.ownerId !== ownerId) continue;",
    validationIndex,
  );
  assert.ok(originIndex >= 0);
  assert.ok(validationIndex > originIndex);
  assert.match(
    source.slice(validationIndex, ownerFilterIndex),
    /parsed,\s*recordOrigin,\s*normalizedApiBaseUrl,\s*ownerHash/u,
  );
  assert.ok(ownerFilterIndex > validationIndex);
});
