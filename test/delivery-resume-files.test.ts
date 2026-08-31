import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("user source resumes persist immutable bytes independently from writing assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-delivery-resume-"));
  try {
    const source = join(root, "source.pdf");
    const storage = join(root, "storage");
    const original = Buffer.from("%PDF-1.7\noriginal resume bytes\n%%EOF");
    await writeFile(source, original);
    const files = new DeliveryResumeFileRepository("owner-1", storage, codec);

    const imported = await files.importFile(source);
    assert.equal(imported.preferred, true);
    assert.equal(imported.slot, 1);
    assert.equal(imported.originalFilename, "source.pdf");
    assert.match(imported.sha256, /^[0-9a-f]{64}$/u);

    await writeFile(source, Buffer.from("%PDF-1.7\nchanged outside app\n%%EOF"));
    const reopened = new DeliveryResumeFileRepository("owner-1", storage, codec);
    const staged = await reopened.stage(imported.id);
    assert.deepEqual(await readFile(staged), original);
    assert.equal((await reopened.list())[0]?.id, imported.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("content hash deduplicates imports and preference is independent metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-delivery-dedupe-"));
  try {
    const firstPath = join(root, "first.pdf");
    const secondPath = join(root, "second.docx");
    await writeFile(firstPath, Buffer.from("%PDF-1.7\nsame\n%%EOF"));
    await writeFile(secondPath, Buffer.from([0x50, 0x4b, 3, 4, 9, 8, 7]));
    const files = new DeliveryResumeFileRepository(
      "owner-1", join(root, "storage"), codec,
    );
    const first = await files.importFile(firstPath);
    assert.equal((await files.importFile(firstPath)).id, first.id);
    const second = await files.importFile(secondPath);
    assert.equal(second.preferred, false);
    assert.equal(second.slot, 2);

    const preferred = await files.setPreferred(second.id);
    assert.equal(preferred.preferred, true);
    assert.equal(preferred.slot, 2);
    assert.deepEqual((await files.list()).map((file) => [file.id, file.preferred]), [
      [second.id, true],
      [first.id, false],
    ]);
    const renamed = await files.rename(second.id, "投递版简历");
    assert.equal(renamed.title, "投递版简历");
    assert.equal(renamed.sha256, second.sha256);
    await files.delete(second.id);
    assert.equal((await files.list())[0]?.preferred, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("three stable slots reject a fourth new file and reuse a deleted slot", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-delivery-slots-"));
  try {
    const files = new DeliveryResumeFileRepository(
      "owner-1", join(root, "storage"), codec,
    );
    const paths = await Promise.all([1, 2, 3, 4].map(async (index) => {
      const path = join(root, `resume-${index}.pdf`);
      await writeFile(path, `%PDF-1.7\nresume ${index}\n%%EOF`);
      return path;
    }));
    const first = await files.importFile(paths[0]!);
    const second = await files.importFile(paths[1]!);
    const third = await files.importFile(paths[2]!);
    assert.deepEqual([first.slot, second.slot, third.slot], [1, 2, 3]);
    assert.equal((await files.importFile(paths[0]!)).id, first.id);
    await assert.rejects(files.importFile(paths[3]!), /最多保存 3 份/u);

    await files.delete(second.id);
    const replacement = await files.importFile(paths[3]!);
    assert.equal(replacement.slot, 2);
    assert.deepEqual(
      (await files.list()).map((item) => item.slot).sort(),
      [1, 2, 3],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1 manifests migrate slots without deleting historical overflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-delivery-v1-"));
  try {
    const storage = join(root, "storage");
    await mkdir(storage);
    const files = [1, 2, 3, 4].map((index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      title: `Legacy ${index}`,
      originalFilename: `legacy-${index}.pdf`,
      type: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: String(index).repeat(64),
      preferred: index === 1,
      createdAt: `2026-08-0${index}T00:00:00.000Z`,
      updatedAt: `2026-08-0${index}T00:00:00.000Z`,
    }));
    await writeFile(join(storage, "manifest.coolto"), codec.encodeText(JSON.stringify({
      schemaVersion: "delivery-resume-files-v1",
      ownerId: "owner-1",
      files,
    })));
    const repository = new DeliveryResumeFileRepository("owner-1", storage, codec);
    const slots = new Map((await repository.list()).map((item) => [item.title, item.slot]));
    assert.deepEqual([...slots.entries()].sort(), [
      ["Legacy 1", 1], ["Legacy 2", 2], ["Legacy 3", 3], ["Legacy 4", null],
    ]);
    await repository.rename(files[0]!.id, "Legacy One");
    const manifest = JSON.parse(codec.decodeText(
      await readFile(join(storage, "manifest.coolto")),
    )) as { schemaVersion: string };
    assert.equal(manifest.schemaVersion, "delivery-resume-files-v2");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("delivery resume import rejects unsupported or disguised files", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-delivery-invalid-"));
  try {
    const invalidPdf = join(root, "invalid.pdf");
    const text = join(root, "resume.txt");
    await writeFile(invalidPdf, "not a PDF");
    await writeFile(text, "resume");
    const files = new DeliveryResumeFileRepository(
      "owner-1", join(root, "storage"), codec,
    );
    await assert.rejects(files.importFile(invalidPdf), /格式与扩展名不一致/u);
    await assert.rejects(files.importFile(text), /仅支持 PDF 或 DOCX/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an in-memory chat attachment enters the same immutable local store", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-delivery-content-"));
  try {
    const content = Buffer.from("%PDF-1.7\nchat attachment\n%%EOF");
    const files = new DeliveryResumeFileRepository(
      "owner-1", join(root, "storage"), codec,
    );
    const imported = await files.importContent("chat-resume.pdf", content);
    assert.equal(imported.originalFilename, "chat-resume.pdf");
    assert.deepEqual(await readFile(await files.stage(imported.id)), content);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
