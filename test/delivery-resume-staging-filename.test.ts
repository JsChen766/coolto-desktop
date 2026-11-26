import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import { DeliveryResumeFileRepository } from
  "../src/delivery-resume-files/file-repository.js";
import type { DeliveryResumeFileCodec } from
  "../src/delivery-resume-files/types.js";

const codec: DeliveryResumeFileCodec = {
  encodeText: (value) => Buffer.from(`text:${value}`, "utf8"),
  decodeText: (value) => Buffer.from(value).toString("utf8").slice(5),
  encodeBytes: (value) => Buffer.concat([Buffer.from("bytes:"), Buffer.from(value)]),
  decodeBytes: (value) => Buffer.from(value).subarray(6),
};

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

test("staged delivery resumes keep the original basename for employer uploads", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-delivery-stage-name-"));
  try {
    const storage = join(root, "storage");
    const content = Buffer.from("%PDF-1.7\n张三的投递简历\n%%EOF");
    const files = new DeliveryResumeFileRepository("owner-1", storage, codec);
    const imported = await files.importContent("张三-产品经理.pdf", content);

    const [first, second] = await Promise.all([
      files.stage(imported.id),
      files.stage(imported.id),
    ]);
    assert.equal(basename(first), "张三-产品经理.pdf");
    assert.equal(basename(second), "张三-产品经理.pdf");
    assert.notEqual(first, second);
    assert.notEqual(dirname(first), dirname(second));
    for (const staged of [first, second]) {
      assert.equal(dirname(dirname(staged)), join(storage, "staging"));
      assert.equal(await exists(staged), true);
      assert.deepEqual(await readFile(staged), content);
      if (process.platform !== "win32") {
        assert.equal((await stat(dirname(staged))).mode & 0o777, 0o700);
        assert.equal((await stat(staged)).mode & 0o777, 0o600);
      }
    }

    await files.clearStaging();
    assert.equal(await exists(first), false);
    assert.equal(await exists(second), false);
    assert.equal(await exists(join(storage, "staging")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("long original names stage without a prefix pushing them past 255 units", async () => {
  // NTFS allows 255 UTF-16 units and APFS/ext4 255 UTF-8 bytes per name; a
  // 37-char UUID prefix would push this 234-char ASCII name past both limits.
  const root = await mkdtemp(join(tmpdir(), "coolto-delivery-stage-long-"));
  try {
    const filename = `${"a".repeat(230)}.pdf`;
    const content = Buffer.from("%PDF-1.7\nlong name\n%%EOF");
    const files = new DeliveryResumeFileRepository(
      "owner-1", join(root, "storage"), codec,
    );
    const imported = await files.importContent(filename, content);
    const staged = await files.stage(imported.id);
    assert.equal(basename(staged), filename);
    assert.deepEqual(await readFile(staged), content);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
