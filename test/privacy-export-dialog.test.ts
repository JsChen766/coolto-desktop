import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("export dialog keeps passphrases in uncontrolled one-shot inputs", async () => {
  const source = await readFile(new URL(
    "../src/desktop/renderer/src/components/DataExportDialog.vue",
    import.meta.url,
  ), "utf8");
  assert.match(source, /new FormData\(form\.value\)/u);
  assert.match(source, /form\.value\?\.reset\(\)/u);
  assert.doesNotMatch(source, /passphrase\s*=\s*ref|confirmation\s*=\s*ref/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage/u);
  assert.doesNotMatch(source, /result\.value[\s\S]{0,160}passphrase/u);
});
test("local export binds one owner across service reads and digest creation", async () => {
  const reader = await readFile(new URL(
    "../src/desktop/main/privacy/local-export-reader.ts",
    import.meta.url,
  ), "utf8");
  const service = await readFile(new URL(
    "../src/desktop/main/privacy/data-export-service.ts",
    import.meta.url,
  ), "utf8");
  assert.match(reader, /services\?\.ownerId === selection\.ownerId[\s\S]{0,100}services\.apiBaseUrl === selection\.apiBaseUrl/u);
  assert.match(reader, /readFromLocalOwner\(selection\.ownerId/u);
  assert.match(service, /const scope = this\.getScope\(\)/u);
  assert.match(service, /sameScope\(scope, this\.getScope\(\)\)/u);
});
